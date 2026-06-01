const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT b.*, s.name as shop_name, g.name as godown_name,
             d.name as driver_name
      FROM bills b
      JOIN shops s ON b.shop_id = s.id
      JOIN godowns g ON b.godown_id = g.id
      LEFT JOIN drivers d ON b.driver_id = d.id
    `;
    const params = [];
    if (req.user.role === 'godown') {
      query += ` WHERE b.godown_id = $1`;
      params.push(req.user.godown_id);
    }
    query += ` ORDER BY b.created_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/items', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bi.*, p.name as product_name FROM bill_items bi
       JOIN products p ON bi.product_id = p.id WHERE bi.bill_id=$1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/shop/:shop_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM bills WHERE shop_id=$1 ORDER BY created_at DESC`,
      [req.params.shop_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  const { shop_id, items, paid_amount, driver_id, delivery_date } = req.body;
  const godown_id = req.user.godown_id;
  if (!godown_id) return res.status(400).json({ error: 'Admin cannot create bills.' });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDeliveryDate = delivery_date || tomorrow.toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const total_amount = items.reduce((sum, i) => sum + parseFloat(i.total_price), 0);
    const paid = parseFloat(paid_amount || 0);
    const pending = Math.max(0, total_amount - paid);
    const status = paid >= total_amount ? 'CLEARED' : paid > 0 ? 'PARTIAL' : 'PENDING';

    const bill = await client.query(
      `INSERT INTO bills (godown_id, shop_id, total_amount, paid_amount, pending_amount, status, driver_id, delivery_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [godown_id, shop_id, total_amount, paid, pending, status, driver_id || null, defaultDeliveryDate]
    );
    const bill_id = bill.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO bill_items (bill_id, product_id, quantity_cases, quantity_units, bottles_per_case, price_per_case, price_per_unit, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [bill_id, item.product_id, parseInt(item.quantity_cases || 0), parseInt(item.quantity_units || 0),
         parseInt(item.bottles_per_case || 24), parseFloat(item.price_per_case || 0),
         parseFloat(item.price_per_unit || 0), parseFloat(item.total_price || 0)]
      );

      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, item.product_id]
      );
      if (!inv.rows[0]) throw new Error(`No inventory found for this product`);

      const productData = await client.query(
        `SELECT selling_price, selling_price_per_unit, bottles_per_case FROM products WHERE id=$1`,
        [item.product_id]
      );
      const prod = productData.rows[0];
      const bpc = parseInt(item.bottles_per_case || prod.bottles_per_case);
      const totalBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
      const soldBottles = (parseInt(item.quantity_cases || 0) * bpc) + parseInt(item.quantity_units || 0);

      if (totalBottles < soldBottles) {
        throw new Error(`Insufficient stock. Available: ${Math.floor(totalBottles / bpc)} cases ${totalBottles % bpc} bottles`);
      }

      const remaining = totalBottles - soldBottles;
      const new_cases = Math.floor(remaining / bpc);
      const new_units = remaining % bpc;
      const cost_deducted = soldBottles * (parseFloat(prod.selling_price) / bpc);

      await client.query(
        `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value - $3
         WHERE godown_id=$4 AND product_id=$5`,
        [new_cases, new_units, cost_deducted, godown_id, item.product_id]
      );
    }

    await client.query('COMMIT');
    res.json(bill.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Update payment on a single bill
router.post('/:id/payment', auth, async (req, res) => {
  const { paid_amount } = req.body;
  try {
    const bill = await pool.query(`SELECT * FROM bills WHERE id=$1`, [req.params.id]);
    if (!bill.rows[0]) return res.status(404).json({ error: 'Bill not found' });
    const total = parseFloat(bill.rows[0].total_amount);
    const newPaid = Math.min(parseFloat(paid_amount), total);
    const newPending = Math.max(0, total - newPaid);
    const newStatus = newPaid >= total ? 'CLEARED' : newPaid > 0 ? 'PARTIAL' : 'PENDING';
    const result = await pool.query(
      `UPDATE bills SET paid_amount=$1, pending_amount=$2, status=$3 WHERE id=$4 RETURNING *`,
      [newPaid, newPending, newStatus, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cash payment for a shop — applies to oldest unpaid bills first
router.post('/shop/:shop_id/cash-payment', auth, async (req, res) => {
  const { amount } = req.body;
  const godown_id = req.user.godown_id;
  if (!amount || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'Amount must be greater than 0' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bills = await client.query(
      `SELECT * FROM bills
       WHERE godown_id = $1 AND shop_id = $2 AND status != 'CLEARED'
       ORDER BY created_at ASC`,
      [godown_id, req.params.shop_id]
    );

    let remaining = parseFloat(amount);
    for (const bill of bills.rows) {
      if (remaining <= 0) break;
      const currentPaid = parseFloat(bill.paid_amount || 0);
      const total = parseFloat(bill.total_amount);
      const currentPending = parseFloat(bill.pending_amount || 0);
      const toApply = Math.min(remaining, currentPending);
      const newPaid = Math.min(currentPaid + toApply, total);
      const newPending = Math.max(0, total - newPaid);
      const newStatus = newPaid >= total ? 'CLEARED' : newPaid > 0 ? 'PARTIAL' : 'PENDING';
      await client.query(
        `UPDATE bills SET paid_amount=$1, pending_amount=$2, status=$3 WHERE id=$4`,
        [newPaid, newPending, newStatus, bill.id]
      );
      remaining -= toApply;
    }

    await client.query('COMMIT');
    res.json({ message: 'Payment applied', remaining });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Update driver and delivery_date
router.put('/:id/delivery', auth, async (req, res) => {
  const { driver_id, delivery_date } = req.body;
  try {
    const result = await pool.query(
      `UPDATE bills SET driver_id=$1, delivery_date=$2 WHERE id=$3 RETURNING *`,
      [driver_id || null, delivery_date || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bill = await client.query(`SELECT * FROM bills WHERE id=$1`, [req.params.id]);
    if (!bill.rows[0]) return res.status(404).json({ error: 'Bill not found' });
    const godown_id = bill.rows[0].godown_id;
    const items = await client.query(
      `SELECT bi.*, p.bottles_per_case FROM bill_items bi
       JOIN products p ON bi.product_id = p.id WHERE bi.bill_id = $1`,
      [req.params.id]
    );
    for (const item of items.rows) {
      const bpc = parseInt(item.bottles_per_case);
      const bottlesToRestore = (parseInt(item.quantity_cases || 0) * bpc) + parseInt(item.quantity_units || 0);
      const costToRestore = parseFloat(item.total_price || 0);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, item.product_id]
      );
      if (inv.rows[0]) {
        const currentBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
        const newTotal = currentBottles + bottlesToRestore;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3
           WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(newTotal / bpc), newTotal % bpc, costToRestore, godown_id, item.product_id]
        );
      }
    }
    await client.query(`DELETE FROM bill_items WHERE bill_id=$1`, [req.params.id]);
    await client.query(`DELETE FROM bills WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Bill deleted and inventory restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/stock/:product_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT quantity_cases, quantity_units, bottles_per_case 
       FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.godown_id = $1 AND i.product_id = $2`,
      [req.user.godown_id, req.params.product_id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;