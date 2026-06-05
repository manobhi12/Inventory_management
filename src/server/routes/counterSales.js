const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// Helper to generate sale number like 010625-1
const generateSaleNumber = async (client) => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yy = String(today.getFullYear()).slice(-2);
  const prefix = `${dd}${mm}${yy}`;

  const result = await client.query(
    `SELECT sale_number FROM counter_sales 
     WHERE sale_number LIKE $1 
     ORDER BY sale_number DESC LIMIT 1`,
    [`${prefix}-%`]
  );

  let nextNum = 1;
  if (result.rows[0]) {
    const last = result.rows[0].sale_number;
    nextNum = parseInt(last.split('-')[1]) + 1;
  }
  return `${prefix}-${nextNum}`;
};

// GET ALL SESSIONS
router.get('/', auth, async (req, res) => {
  const { role, godown_id } = req.user;
  try {
    let query = `
      SELECT cs.*, g.name as godown_name
      FROM counter_sales cs
      LEFT JOIN godowns g ON cs.godown_id = g.id
    `;
    const params = [];
    if (role !== 'admin') {
      query += ` WHERE cs.godown_id = $1`;
      params.push(godown_id);
    }
    query += ` ORDER BY cs.created_at DESC`;
    const sessions = await pool.query(query, params);
    res.json(sessions.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ITEMS for a session
router.get('/:id/items', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT csi.*, p.name as product_name, p.bottles_per_case
       FROM counter_sale_items csi
       JOIN products p ON csi.product_id = p.id
       WHERE csi.counter_sale_id = $1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — create full session with all items
router.post('/', auth, async (req, res) => {
  const { items, payment_mode } = req.body;
  const godown_id = req.user.godown_id || req.body.godown_id;
  if (!godown_id) return res.status(400).json({ error: 'Godown required' });
  if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });

  const mode = payment_mode === 'ONLINE' ? 'ONLINE' : 'CASH';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sale_number = await generateSaleNumber(client);

    const total_amount = items.reduce((sum, item) => {
      return sum + (parseInt(item.quantity_units) * parseFloat(item.price_per_unit || 0));
    }, 0);

    const session = await client.query(
      `INSERT INTO counter_sales (godown_id, total_amount, payment_mode, sale_number)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [godown_id, total_amount, mode, sale_number]
    );
    const counter_sale_id = session.rows[0].id;

    for (const item of items) {
      const { product_id, quantity_units, price_per_unit } = item;
      const qty = parseInt(quantity_units);
      if (!product_id || qty <= 0) continue;

      const item_total = qty * parseFloat(price_per_unit || 0);

      await client.query(
        `INSERT INTO counter_sale_items (counter_sale_id, godown_id, product_id, quantity_units, price_per_unit, total_amount, payment_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [counter_sale_id, godown_id, product_id, qty, parseFloat(price_per_unit || 0), item_total, mode]
      );

      const prod = await client.query(
        `SELECT bottles_per_case FROM products WHERE id=$1`, [product_id]
      );
      if (!prod.rows[0]) throw new Error('Product not found');
      const bpc = parseInt(prod.rows[0].bottles_per_case);

      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, product_id]
      );
      if (!inv.rows[0]) throw new Error('No inventory found for this product');

      const totalBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
      if (totalBottles < qty) throw new Error(`Insufficient stock. Available: ${totalBottles} bottles`);

      const newTotal = totalBottles - qty;
      await client.query(
        `UPDATE inventory SET quantity_cases=$1, quantity_units=$2
         WHERE godown_id=$3 AND product_id=$4`,
        [Math.floor(newTotal / bpc), newTotal % bpc, godown_id, product_id]
      );
    }

    if (mode === 'ONLINE') {
      await client.query(
        `INSERT INTO online_transactions (godown_id, is_counter_sale, amount, transaction_date, notes, counter_sale_id)
         VALUES ($1, true, $2, CURRENT_DATE, 'Counter sale online payment', $3)`,
        [godown_id, total_amount, counter_sale_id]
      );
    }

    await client.query('COMMIT');
    res.json(session.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT — edit a single item within a session
router.put('/items/:id', auth, async (req, res) => {
  const { product_id, quantity_units, price_per_unit } = req.body;
  const godown_id = req.user.godown_id || req.body.godown_id;
  if (!godown_id) return res.status(400).json({ error: 'Godown required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const original = await client.query(
      `SELECT * FROM counter_sale_items WHERE id=$1`, [req.params.id]
    );
    if (!original.rows[0]) throw new Error('Item not found');
    const orig = original.rows[0];

    // Restore original inventory
    const origProd = await client.query(
      `SELECT bottles_per_case FROM products WHERE id=$1`, [orig.product_id]
    );
    if (origProd.rows[0]) {
      const bpc = parseInt(origProd.rows[0].bottles_per_case);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, orig.product_id]
      );
      if (inv.rows[0]) {
        const currentBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
        const restored = currentBottles + parseInt(orig.quantity_units);
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2
           WHERE godown_id=$3 AND product_id=$4`,
          [Math.floor(restored / bpc), restored % bpc, godown_id, orig.product_id]
        );
      }
    }

    // Deduct new inventory
    const newProd = await client.query(
      `SELECT bottles_per_case FROM products WHERE id=$1`, [product_id]
    );
    if (!newProd.rows[0]) throw new Error('Product not found');
    const bpc = parseInt(newProd.rows[0].bottles_per_case);

    const inv = await client.query(
      `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
      [godown_id, product_id]
    );
    if (!inv.rows[0]) throw new Error('No inventory found');
    const qty = parseInt(quantity_units);
    const totalBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
    if (totalBottles < qty) throw new Error(`Insufficient stock. Available: ${totalBottles} bottles`);

    const newTotal = totalBottles - qty;
    await client.query(
      `UPDATE inventory SET quantity_cases=$1, quantity_units=$2
       WHERE godown_id=$3 AND product_id=$4`,
      [Math.floor(newTotal / bpc), newTotal % bpc, godown_id, product_id]
    );

    const item_total = qty * parseFloat(price_per_unit || 0);
    const result = await client.query(
      `UPDATE counter_sale_items SET product_id=$1, quantity_units=$2, price_per_unit=$3, total_amount=$4
       WHERE id=$5 RETURNING *`,
      [product_id, qty, parseFloat(price_per_unit || 0), item_total, req.params.id]
    );

    // Update session total
    await client.query(
      `UPDATE counter_sales SET total_amount = (
        SELECT COALESCE(SUM(total_amount), 0) FROM counter_sale_items WHERE counter_sale_id = $1
      ) WHERE id = $1`,
      [orig.counter_sale_id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /:id — update entire session (replace all items)
router.put('/:id', auth, async (req, res) => {
  const { items, payment_mode } = req.body;
  const godown_id = req.user.godown_id || req.body.godown_id;
  if (!godown_id) return res.status(400).json({ error: 'Godown required' });
  if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });

  const mode = payment_mode === 'ONLINE' ? 'ONLINE' : 'CASH';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get existing items to restore inventory
    const oldItems = await client.query(
      `SELECT csi.*, p.bottles_per_case FROM counter_sale_items csi
       JOIN products p ON csi.product_id = p.id
       WHERE csi.counter_sale_id = $1`,
      [req.params.id]
    );

    // Restore inventory for all old items
    for (const item of oldItems.rows) {
      const bpc = parseInt(item.bottles_per_case);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [item.godown_id, item.product_id]
      );
      if (inv.rows[0]) {
        const currentBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
        const restored = currentBottles + parseInt(item.quantity_units);
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2
           WHERE godown_id=$3 AND product_id=$4`,
          [Math.floor(restored / bpc), restored % bpc, item.godown_id, item.product_id]
        );
      }
    }

    // Delete all old items
    await client.query(`DELETE FROM counter_sale_items WHERE counter_sale_id=$1`, [req.params.id]);

    // Insert new items and deduct inventory
    let total_amount = 0;
    for (const item of items) {
      const { product_id, quantity_units, price_per_unit } = item;
      const qty = parseInt(quantity_units);
      if (!product_id || qty <= 0) continue;

      const item_total = qty * parseFloat(price_per_unit || 0);
      total_amount += item_total;

      await client.query(
        `INSERT INTO counter_sale_items (counter_sale_id, godown_id, product_id, quantity_units, price_per_unit, total_amount, payment_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.id, godown_id, product_id, qty, parseFloat(price_per_unit || 0), item_total, mode]
      );

      const prod = await client.query(
        `SELECT bottles_per_case FROM products WHERE id=$1`, [product_id]
      );
      if (!prod.rows[0]) throw new Error('Product not found');
      const bpc = parseInt(prod.rows[0].bottles_per_case);

      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, product_id]
      );
      if (!inv.rows[0]) throw new Error('No inventory found for this product');

      const totalBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
      if (totalBottles < qty) throw new Error(`Insufficient stock. Available: ${totalBottles} bottles`);

      const newTotal = totalBottles - qty;
      await client.query(
        `UPDATE inventory SET quantity_cases=$1, quantity_units=$2
         WHERE godown_id=$3 AND product_id=$4`,
        [Math.floor(newTotal / bpc), newTotal % bpc, godown_id, product_id]
      );
    }

    // Update session total and payment mode
    const result = await client.query(
      `UPDATE counter_sales SET total_amount=$1, payment_mode=$2 WHERE id=$3 RETURNING *`,
      [total_amount, mode, req.params.id]
    );

    await client.query(`DELETE FROM online_transactions WHERE counter_sale_id = $1`, [req.params.id]);
    if (mode === 'ONLINE') {
      await client.query(
        `INSERT INTO online_transactions (godown_id, is_counter_sale, amount, transaction_date, notes, counter_sale_id)
         VALUES ($1, true, $2, CURRENT_DATE, 'Counter sale online payment', $3)`,
        [godown_id, total_amount, req.params.id]
      );
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
    
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE — delete entire session
router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const session = await client.query(
      `SELECT * FROM counter_sales WHERE id=$1`, [req.params.id]
    );
    if (!session.rows[0]) return res.status(404).json({ error: 'Sale not found' });

    const items = await client.query(
      `SELECT csi.*, p.bottles_per_case FROM counter_sale_items csi
       JOIN products p ON csi.product_id = p.id
       WHERE csi.counter_sale_id = $1`,
      [req.params.id]
    );

    for (const item of items.rows) {
      const bpc = parseInt(item.bottles_per_case);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [item.godown_id, item.product_id]
      );
      if (inv.rows[0]) {
        const currentBottles = (parseInt(inv.rows[0].quantity_cases) * bpc) + parseInt(inv.rows[0].quantity_units || 0);
        const newTotal = currentBottles + parseInt(item.quantity_units);
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2
           WHERE godown_id=$3 AND product_id=$4`,
          [Math.floor(newTotal / bpc), newTotal % bpc, item.godown_id, item.product_id]
        );
      }
    }

    // Restore free_products inventory
    const linkedFP = await client.query(
      `SELECT * FROM free_products WHERE counter_sale_id = $1`, [req.params.id]
    );
    for (const fp of linkedFP.rows) {
      const fpProd = await client.query(
        `SELECT bottles_per_case, selling_price_per_unit FROM products WHERE id=$1`, [fp.product_id]
      );
      if (fpProd.rows[0]) {
        const fpBpc = parseInt(fpProd.rows[0].bottles_per_case);
        const costRestored = fp.quantity_units * parseFloat(fpProd.rows[0].selling_price_per_unit || 0);
        const fpInv = await client.query(
          `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
          [fp.godown_id, fp.product_id]
        );
        if (fpInv.rows[0]) {
          const currentBottles = (parseInt(fpInv.rows[0].quantity_cases) * fpBpc) + parseInt(fpInv.rows[0].quantity_units || 0);
          const newTotal = currentBottles + parseInt(fp.quantity_units);
          await client.query(
            `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3
             WHERE godown_id=$4 AND product_id=$5`,
            [Math.floor(newTotal / fpBpc), newTotal % fpBpc, costRestored, fp.godown_id, fp.product_id]
          );
        }
      }
    }

    await client.query(`DELETE FROM counter_sales WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Sale deleted and inventory restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;