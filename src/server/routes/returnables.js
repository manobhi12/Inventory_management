const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET all returnables with outstanding quantity
router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT r.*, s.name as shop_name, s.owner_name as shop_owner,
             p.name as product_name, g.name as godown_name
      FROM returnables r
      JOIN shops s ON r.shop_id = s.id
      JOIN products p ON r.product_id = p.id
      JOIN godowns g ON r.godown_id = g.id
      WHERE r.quantity_out > 0
    `;
    const params = [];
    if (req.user.role === 'godown') {
      query += ` AND r.godown_id = $1`;
      params.push(req.user.godown_id);
    }
    query += ` ORDER BY r.updated_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — record a return (shop gave back bottles)
router.post('/:id/return', auth, async (req, res) => {
  const { quantity_returned } = req.body;
  if (!quantity_returned || parseInt(quantity_returned) <= 0)
    return res.status(400).json({ error: 'quantity_returned must be > 0' });

  try {
    const rec = await pool.query(`SELECT * FROM returnables WHERE id=$1`, [req.params.id]);
    if (!rec.rows[0]) return res.status(404).json({ error: 'Not found' });

    const newQty = Math.max(0, rec.rows[0].quantity_out - parseInt(quantity_returned));
    const result = await pool.query(
      `UPDATE returnables SET quantity_out=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
      [newQty, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT — manual override of quantity_out
router.put('/:id', auth, async (req, res) => {
  const { quantity_out } = req.body;
  try {
    const result = await pool.query(
      `UPDATE returnables SET quantity_out=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
      [Math.max(0, parseInt(quantity_out || 0)), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;