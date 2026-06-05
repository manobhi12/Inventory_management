const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT i.*, 
             p.name as product_name, p.category, p.size, 
             p.bottles_per_case, p.selling_price, p.selling_price_per_unit,
             g.name as godown_name,
             ((i.quantity_cases * p.selling_price) + (i.quantity_units * p.selling_price_per_unit)) as stock_value
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN godowns g ON i.godown_id = g.id
    `;
    const params = [];
    if (req.user.role === 'godown') {
      query += ` WHERE i.godown_id = $1`;
      params.push(req.user.godown_id);
    }
    query += ` ORDER BY p.name`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;