const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const apicache = require('apicache');

router.get('/', auth, async (req, res) => {
  let query = `SELECT s.*, r.name as route_name FROM shops s LEFT JOIN routes r ON s.route_id = r.id`;
  const params = [];
  if (req.user.role === 'godown') {
    query += ` WHERE s.godown_id = $1`;
    params.push(req.user.godown_id);
  }
  const result = await pool.query(query, params);
  res.json(result.rows);
});

router.post('/', auth, async (req, res) => {
  const { name, owner_name, phone, route_id } = req.body;
  const godown_id = req.user.godown_id;
  const result = await pool.query(
    `INSERT INTO shops (godown_id, route_id, name, owner_name, phone) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [godown_id, route_id || null, name, owner_name || null, phone || null]
  );
  apicache.clear();
  res.json(result.rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  const { name, owner_name, phone, route_id } = req.body;
  const result = await pool.query(
    `UPDATE shops SET name=$1, owner_name=$2, phone=$3, route_id=$4 WHERE id=$5 RETURNING *`,
    [name, owner_name || null, phone || null, route_id || null, req.params.id]
  );
  apicache.clear();
  res.json(result.rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  await pool.query(`DELETE FROM shops WHERE id=$1`, [req.params.id]);
  apicache.clear();
  res.json({ message: 'Deleted' });
});

module.exports = router;