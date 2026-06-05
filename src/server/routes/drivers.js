const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET all drivers
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM drivers ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add driver
router.post('/', auth, async (req, res) => {
  const { name, phone } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO drivers (name, phone) VALUES ($1,$2) RETURNING *`,
      [name, phone || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT edit driver
router.put('/:id', auth, async (req, res) => {
  const { name, phone } = req.body;
  try {
    const result = await pool.query(
      `UPDATE drivers SET name=$1, phone=$2 WHERE id=$3 RETURNING *`,
      [name, phone || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE driver
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM drivers WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET trips for a driver — total_trip_amount calculated from bills
router.get('/:id/trips', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         dt.id,
         dt.driver_id,
         dt.trip_date,
         dt.route_id,
         r.name AS route_name,
         dt.amount_received,
         dt.notes,
         dt.created_at,
         COALESCE(
           (
             SELECT SUM(b.total_amount)
             FROM bills b
             JOIN shops s ON s.id = b.shop_id
             WHERE b.driver_id = dt.driver_id
               AND b.delivery_date = dt.trip_date
               AND s.route_id = dt.route_id
           ), 0
         ) AS total_trip_amount
       FROM driver_trips dt
       LEFT JOIN routes r ON r.id = dt.route_id
       WHERE dt.driver_id = $1
       ORDER BY dt.trip_date DESC, dt.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add trip
router.post('/:id/trips', auth, async (req, res) => {
  const { trip_date, route_id, amount_received, notes, trip_load, load_returned } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO driver_trips (driver_id, trip_date, route_id, amount_received, notes, trip_load, load_returned)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, trip_date, route_id || null, parseFloat(amount_received || 0), notes || null,
       parseFloat(trip_load || 0), parseFloat(load_returned || 0)]
    );
    // Return with calculated total and route name
    const full = await pool.query(
      `SELECT
         dt.id, dt.driver_id, dt.trip_date, dt.route_id, r.name AS route_name,
         dt.amount_received, dt.notes, dt.created_at,
         COALESCE(
           (SELECT SUM(b.total_amount) FROM bills b JOIN shops s ON s.id = b.shop_id
            WHERE b.driver_id = dt.driver_id AND b.delivery_date = dt.trip_date AND s.route_id = dt.route_id),
         0) AS total_trip_amount
       FROM driver_trips dt
       LEFT JOIN routes r ON r.id = dt.route_id
       WHERE dt.id = $1`,
      [result.rows[0].id]
    );
    res.json(full.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT edit trip — only amount_received and notes editable
router.put('/trips/:trip_id', auth, async (req, res) => {
  const { amount_received, notes, trip_load, load_returned } = req.body;
  try {
    const result = await pool.query(
      `UPDATE driver_trips SET amount_received=$1, notes=$2, trip_load=$3, load_returned=$4 WHERE id=$5 RETURNING *`,
      [parseFloat(amount_received || 0), notes || null, parseFloat(trip_load || 0), parseFloat(load_returned || 0), req.params.trip_id]
    );
    const full = await pool.query(
      `SELECT
         dt.id, dt.driver_id, dt.trip_date, dt.route_id, r.name AS route_name,
         dt.amount_received, dt.notes, dt.created_at,
         COALESCE(
           (SELECT SUM(b.total_amount) FROM bills b JOIN shops s ON s.id = b.shop_id
            WHERE b.driver_id = dt.driver_id AND b.delivery_date = dt.trip_date AND s.route_id = dt.route_id),
         0) AS total_trip_amount
       FROM driver_trips dt
       LEFT JOIN routes r ON r.id = dt.route_id
       WHERE dt.id = $1`,
      [result.rows[0].id]
    );
    res.json(full.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE trip
router.delete('/trips/:trip_id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM driver_trips WHERE id=$1`, [req.params.trip_id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET driver load sheet — all bills for a driver on a date
router.get('/:id/loadsheet', auth, async (req, res) => {
  const { date } = req.query;
  try {
    const bills = await pool.query(
      `SELECT b.id, b.total_amount, r.name as route_name
       FROM bills b
       JOIN shops s ON s.id = b.shop_id
       LEFT JOIN routes r ON r.id = s.route_id
       WHERE b.driver_id = $1 AND b.delivery_date = $2 AND b.godown_id = $3`,
      [req.params.id, date, req.user.godown_id]
    );
    if (!bills.rows.length) return res.json({ bills: [], items: [] });

    const billIds = bills.rows.map(b => b.id);
    const items = await pool.query(
      `SELECT bi.product_id, p.name as product_name, p.bottles_per_case,
              SUM(bi.quantity_cases) as quantity_cases,
              SUM(bi.quantity_units) as quantity_units,
              MAX(bi.price_per_case) as price_per_case,
              MAX(bi.price_per_unit) as price_per_unit
       FROM bill_items bi
       JOIN products p ON p.id = bi.product_id
       WHERE bi.bill_id = ANY($1)
       GROUP BY bi.product_id, p.name, p.bottles_per_case`,
      [billIds]
    );
    res.json({
      bills: bills.rows,
      items: items.rows,
      routes: [...new Set(bills.rows.map(b => b.route_name).filter(Boolean))]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;