const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT b.*, p.name as product_name, p.breakage_penalty, g.name as godown_name,
             s.name as shop_name
      FROM breakage b
      JOIN products p ON b.product_id = p.id
      JOIN godowns g ON b.godown_id = g.id
      LEFT JOIN shops s ON b.shop_id = s.id
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

router.post('/', auth, async (req, res) => {
  const { product_id, quantity_bottles, reason, breakage_date, shop_id } = req.body;
  const godown_id = req.user.godown_id;
  if (!godown_id) return res.status(400).json({ error: 'Admin cannot add breakage' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prod = await client.query(
      `SELECT breakage_penalty, bottles_per_case, selling_price_per_unit FROM products WHERE id=$1`,
      [product_id]
    );
    if (!prod.rows[0]) throw new Error('Product not found');
    const penalty = parseFloat(prod.rows[0].breakage_penalty || 3);
    const total_penalty = penalty * parseInt(quantity_bottles);

    const result = await client.query(
      `INSERT INTO breakage (godown_id, product_id, quantity_bottles, penalty_per_bottle, total_penalty, reason, breakage_date, shop_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [godown_id, product_id, quantity_bottles, penalty, total_penalty, reason,
       breakage_date || new Date().toISOString().split('T')[0], shop_id || null]
    );

    // Only deduct inventory for godown/loading breakage — company replaces, reseller already has it
    const isGodownBreakage = reason && (reason.includes('godown') || reason.toLowerCase().includes('purchasing') || reason.toLowerCase().includes('company'));
    if (isGodownBreakage) {
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, product_id]
      );
      if (inv.rows[0]) {
        const bpc = parseInt(prod.rows[0].bottles_per_case);
        const pricePerBottle = parseFloat(prod.rows[0].selling_price_per_unit || 0);
        const totalBottles = (inv.rows[0].quantity_cases * bpc) + (inv.rows[0].quantity_units || 0);
        const remaining = Math.max(0, totalBottles - parseInt(quantity_bottles));
        const new_cases = Math.floor(remaining / bpc);
        const new_units = remaining % bpc;
        const valueDeduction = parseInt(quantity_bottles) * pricePerBottle;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2,
           stock_value = GREATEST(0, stock_value - $3)
           WHERE godown_id=$4 AND product_id=$5`,
          [new_cases, new_units, valueDeduction, godown_id, product_id]
        );
      }
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

router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const brk = await client.query(`SELECT * FROM breakage WHERE id=$1`, [req.params.id]);
    if (!brk.rows[0]) return res.status(404).json({ error: 'Not found' });
    const b = brk.rows[0];

    // Only restore inventory if it was a godown breakage (only case we deducted)
    const isGodownBreakage = b.reason && (b.reason.includes('godown') || b.reason.toLowerCase().includes('purchasing') || b.reason.toLowerCase().includes('company'));
    if (isGodownBreakage) {
      const prod = await client.query(
        `SELECT bottles_per_case, selling_price_per_unit FROM products WHERE id=$1`,
        [b.product_id]
      );
      if (prod.rows[0]) {
        const bpc = parseInt(prod.rows[0].bottles_per_case);
        const pricePerBottle = parseFloat(prod.rows[0].selling_price_per_unit || 0);
        const inv = await client.query(
          `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
          [b.godown_id, b.product_id]
        );
        if (inv.rows[0]) {
          const currentBottles = (inv.rows[0].quantity_cases * bpc) + (inv.rows[0].quantity_units || 0);
          const restored = currentBottles + parseInt(b.quantity_bottles);
          const valueRestore = parseInt(b.quantity_bottles) * pricePerBottle;
          await client.query(
            `UPDATE inventory SET quantity_cases=$1, quantity_units=$2,
             stock_value = stock_value + $3
             WHERE godown_id=$4 AND product_id=$5`,
            [Math.floor(restored / bpc), restored % bpc, valueRestore, b.godown_id, b.product_id]
          );
        }
      }
    }

    await client.query(`DELETE FROM breakage WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;