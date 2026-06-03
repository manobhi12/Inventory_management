const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  let query = `
    SELECT pu.*, c.name as company_name, g.name as godown_name
    FROM purchases pu
    JOIN companies c ON pu.company_id = c.id
    JOIN godowns g ON pu.godown_id = g.id
  `;
  const params = [];
  if (req.user.role === 'godown') {
    query += ` WHERE pu.godown_id = $1`;
    params.push(req.user.godown_id);
  }
  query += ` ORDER BY pu.purchase_date DESC, pu.created_at DESC`;
  const result = await pool.query(query, params);
  res.json(result.rows);
});

router.get('/:id/items', auth, async (req, res) => {
  const result = await pool.query(
    `SELECT pi.*, p.name as product_name FROM purchase_items pi
     JOIN products p ON pi.product_id = p.id
     WHERE pi.purchase_id = $1`,
    [req.params.id]
  );
  res.json(result.rows);
});

router.post('/', auth, async (req, res) => {
  const { company_id, purchase_date, items, paid_amount, gst_amount, transport_cost } = req.body;
  const godown_id = req.user.godown_id;
  if (!godown_id) return res.status(400).json({ error: 'Admin cannot create purchases.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const items_total = items.reduce((sum, i) => sum + parseFloat(i.total_price), 0);
    const gst = parseFloat(gst_amount || 0);
    const transport = parseFloat(transport_cost || 0);
    const total_amount = items_total + gst + transport;

    const paid = Math.min(parseFloat(paid_amount || 0), total_amount);
    const status = paid >= total_amount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING';

    const purchase = await client.query(
      `INSERT INTO purchases (godown_id, company_id, total_amount, purchase_date, paid_amount, payment_status, gst_amount, transport_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [godown_id, company_id, total_amount, purchase_date, paid, status, gst, transport]
    );
    const purchase_id = purchase.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity_cases, price_per_case, total_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [purchase_id, item.product_id, item.quantity_cases, item.price_per_case, item.total_price]
      );

      await client.query(
        `INSERT INTO inventory (godown_id, product_id, quantity_cases, quantity_units, selling_price_per_case, selling_price_per_unit, stock_value)
         VALUES ($1, $2, $3, 0,
           (SELECT selling_price FROM products WHERE id=$2),
           (SELECT selling_price_per_unit FROM products WHERE id=$2),
           $4)
         ON CONFLICT (godown_id, product_id) DO UPDATE SET
           quantity_cases = inventory.quantity_cases + $3,
           stock_value = inventory.stock_value + $4`,
        [godown_id, item.product_id, item.quantity_cases, item.total_price]
      );
    }

    // Increase company outstanding by full purchase amount, decrease by what's already paid
    await client.query(
      `UPDATE companies SET outstanding_balance = outstanding_balance + $1 WHERE id = $2`,
      [total_amount - paid, company_id]
    );

    await client.query('COMMIT');
    res.json(purchase.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post('/:id/payment', auth, async (req, res) => {
  const { paid_amount } = req.body;
  const purchase = await pool.query(`SELECT * FROM purchases WHERE id=$1`, [req.params.id]);
  if (!purchase.rows[0]) return res.status(404).json({ error: 'Not found' });
  const p = purchase.rows[0];
  const total = parseFloat(p.total_amount);
  const already_paid = parseFloat(p.paid_amount || 0);
  const new_paid = Math.min(already_paid + parseFloat(paid_amount), total);
  const status = new_paid >= total ? 'PAID' : 'PARTIAL';
  const result = await pool.query(
    `UPDATE purchases SET paid_amount=$1, payment_status=$2 WHERE id=$3 RETURNING *`,
    [new_paid, status, req.params.id]
  );

  // Reduce company outstanding by the newly paid amount
  const newly_paid = new_paid - already_paid;
  if (newly_paid > 0) {
    await pool.query(
      `UPDATE companies SET outstanding_balance = outstanding_balance - $1 WHERE id = $2`,
      [newly_paid, p.company_id]
    );
  }

  res.json(result.rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  const { company_id, purchase_date, items, gst_amount, transport_cost } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oldPurchase = await client.query(`SELECT * FROM purchases WHERE id=$1`, [req.params.id]);
    if (!oldPurchase.rows[0]) return res.status(404).json({ error: 'Purchase not found' });
    const godown_id = oldPurchase.rows[0].godown_id;

    // Reverse old items from inventory
    const oldItems = await client.query(`SELECT * FROM purchase_items WHERE purchase_id=$1`, [req.params.id]);
    for (const item of oldItems.rows) {
      const prod = await client.query(`SELECT bottles_per_case FROM products WHERE id=$1`, [item.product_id]);
      await client.query(
        `UPDATE inventory SET
           quantity_cases = quantity_cases - $1,
           stock_value = stock_value - $2
         WHERE godown_id=$3 AND product_id=$4`,
        [item.quantity_cases, item.total_price, godown_id, item.product_id]
      );
    }

    // Delete old items
    await client.query(`DELETE FROM purchase_items WHERE purchase_id=$1`, [req.params.id]);

    // Recalculate totals
    const items_total = items.reduce((sum, i) => sum + parseFloat(i.total_price), 0);
    const gst = parseFloat(gst_amount || 0);
    const transport = parseFloat(transport_cost || 0);
    const new_total = items_total + gst + transport;

    // Keep paid_amount, recalculate status
    const paid = parseFloat(oldPurchase.rows[0].paid_amount || 0);
    const new_paid = Math.min(paid, new_total);
    const status = new_paid >= new_total ? 'PAID' : new_paid > 0 ? 'PARTIAL' : 'PENDING';

    // Update purchase row
    await client.query(
      `UPDATE purchases SET company_id=$1, purchase_date=$2, total_amount=$3, gst_amount=$4, transport_cost=$5, paid_amount=$6, payment_status=$7 WHERE id=$8`,
      [company_id, purchase_date, new_total, gst, transport, new_paid, status, req.params.id]
    );

    // Insert new items + update inventory
    for (const item of items) {
      await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity_cases, price_per_case, total_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, item.product_id, item.quantity_cases, item.price_per_case, item.total_price]
      );
      await client.query(
        `INSERT INTO inventory (godown_id, product_id, quantity_cases, quantity_units, selling_price_per_case, selling_price_per_unit, stock_value)
         VALUES ($1, $2, $3, 0,
           (SELECT selling_price FROM products WHERE id=$2),
           (SELECT selling_price_per_unit FROM products WHERE id=$2),
           $4)
         ON CONFLICT (godown_id, product_id) DO UPDATE SET
           quantity_cases = inventory.quantity_cases + $3,
           stock_value = inventory.stock_value + $4`,
        [godown_id, item.product_id, item.quantity_cases, item.total_price]
      );
    }

    // Fix company outstanding: old_outstanding = old_total - old_paid, new = new_total - new_paid
    const old_outstanding = parseFloat(oldPurchase.rows[0].total_amount) - parseFloat(oldPurchase.rows[0].paid_amount || 0);
    const new_outstanding = new_total - new_paid;
    const diff = new_outstanding - old_outstanding;
    if (diff !== 0) {
      await client.query(
        `UPDATE companies SET outstanding_balance = outstanding_balance + $1 WHERE id=$2`,
        [diff, company_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Purchase updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = await client.query(`SELECT * FROM purchase_items WHERE purchase_id=$1`, [req.params.id]);
    const purchase = await client.query(`SELECT * FROM purchases WHERE id=$1`, [req.params.id]);
    const godown_id = purchase.rows[0]?.godown_id;

    for (const item of items.rows) {
      await client.query(
        `UPDATE inventory SET
           quantity_cases = quantity_cases - $1,
           stock_value = stock_value - $2
         WHERE godown_id=$3 AND product_id=$4`,
        [item.quantity_cases, item.total_price, godown_id, item.product_id]
      );
    }

    await client.query(`DELETE FROM purchase_items WHERE purchase_id=$1`, [req.params.id]);
    await client.query(`DELETE FROM purchases WHERE id=$1`, [req.params.id]);

    // Reverse outstanding — only the unpaid portion was outstanding
    const p = purchase.rows[0];
    const unpaid = parseFloat(p.total_amount) - parseFloat(p.paid_amount || 0);
    if (unpaid > 0) {
      await client.query(
        `UPDATE companies SET outstanding_balance = outstanding_balance - $1 WHERE id = $2`,
        [unpaid, p.company_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Deleted and inventory reversed' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;