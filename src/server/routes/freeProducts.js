const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT fp.*, p.name as product_name, p.size, p.category,
             s.name as shop_name
      FROM free_products fp
      JOIN products p ON fp.product_id = p.id
      LEFT JOIN shops s ON fp.shop_id = s.id
    `;
    const params = [];
    if (req.user.role === 'godown') {
      query += ` WHERE fp.godown_id = $1`;
      params.push(req.user.godown_id);
    }
    query += ` ORDER BY fp.given_date DESC, fp.created_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  const { product_id, quantity_units, notes, given_date, shop_id, sale_type } = req.body;
  const godown_id = req.user.godown_id;

  if (!quantity_units || quantity_units <= 0)
    return res.status(400).json({ error: 'quantity_units must be greater than 0' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO free_products (godown_id, product_id, quantity_units, notes, given_date, shop_id, sale_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [godown_id, product_id, quantity_units, notes || null,
       given_date || new Date(), shop_id || null, sale_type || 'DELIVERY']
    );

    // Deduct from inventory + stock_value
    const prod = await client.query(
      `SELECT bottles_per_case, selling_price_per_unit FROM products WHERE id=$1`,
      [product_id]
    );
    if (prod.rows[0]) {
      const bpc = parseInt(prod.rows[0].bottles_per_case);
      const pricePerBottle = parseFloat(prod.rows[0].selling_price_per_unit || 0);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, product_id]
      );
      if (inv.rows[0]) {
        const totalBottles = (inv.rows[0].quantity_cases * bpc) + (inv.rows[0].quantity_units || 0);
        const remaining = Math.max(0, totalBottles - parseInt(quantity_units));
        const valueDeduction = parseInt(quantity_units) * pricePerBottle;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2,
           stock_value = GREATEST(0, stock_value - $3)
           WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(remaining / bpc), remaining % bpc, valueDeduction, godown_id, product_id]
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

router.put('/:id', auth, async (req, res) => {
  const { product_id, quantity_units, notes, given_date, shop_id, sale_type } = req.body;
  const godown_id = req.user.godown_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get old entry to reverse its inventory deduction
    const old = await client.query(`SELECT * FROM free_products WHERE id=$1`, [req.params.id]);
    if (!old.rows[0]) return res.status(404).json({ error: 'Not found' });
    const oldEntry = old.rows[0];

    // Reverse old deduction
    const oldProd = await client.query(
      `SELECT bottles_per_case, selling_price_per_unit FROM products WHERE id=$1`,
      [oldEntry.product_id]
    );
    if (oldProd.rows[0]) {
      const bpc = parseInt(oldProd.rows[0].bottles_per_case);
      const pricePerBottle = parseFloat(oldProd.rows[0].selling_price_per_unit || 0);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, oldEntry.product_id]
      );
      if (inv.rows[0]) {
        const currentBottles = (inv.rows[0].quantity_cases * bpc) + (inv.rows[0].quantity_units || 0);
        const restored = currentBottles + parseInt(oldEntry.quantity_units);
        const valueRestore = parseInt(oldEntry.quantity_units) * pricePerBottle;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3
           WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(restored / bpc), restored % bpc, valueRestore, godown_id, oldEntry.product_id]
        );
      }
    }

    // Apply new deduction
    const newProd = await client.query(
      `SELECT bottles_per_case, selling_price_per_unit FROM products WHERE id=$1`,
      [product_id]
    );
    if (newProd.rows[0]) {
      const bpc = parseInt(newProd.rows[0].bottles_per_case);
      const pricePerBottle = parseFloat(newProd.rows[0].selling_price_per_unit || 0);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [godown_id, product_id]
      );
      if (inv.rows[0]) {
        const totalBottles = (inv.rows[0].quantity_cases * bpc) + (inv.rows[0].quantity_units || 0);
        const remaining = Math.max(0, totalBottles - parseInt(quantity_units));
        const valueDeduction = parseInt(quantity_units) * pricePerBottle;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2,
           stock_value = GREATEST(0, stock_value - $3)
           WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(remaining / bpc), remaining % bpc, valueDeduction, godown_id, product_id]
        );
      }
    }

    const result = await client.query(
      `UPDATE free_products SET product_id=$1, quantity_units=$2, notes=$3, given_date=$4, shop_id=$5, sale_type=$6
       WHERE id=$7 RETURNING *`,
      [product_id, quantity_units, notes || null, given_date, shop_id || null, sale_type || 'DELIVERY', req.params.id]
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

router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fp = await client.query(`SELECT * FROM free_products WHERE id=$1`, [req.params.id]);
    if (!fp.rows[0]) return res.status(404).json({ error: 'Not found' });
    const entry = fp.rows[0];

    // Restore inventory + stock_value on delete
    const prod = await client.query(
      `SELECT bottles_per_case, selling_price_per_unit FROM products WHERE id=$1`,
      [entry.product_id]
    );
    if (prod.rows[0]) {
      const bpc = parseInt(prod.rows[0].bottles_per_case);
      const pricePerBottle = parseFloat(prod.rows[0].selling_price_per_unit || 0);
      const inv = await client.query(
        `SELECT quantity_cases, quantity_units FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [entry.godown_id, entry.product_id]
      );
      if (inv.rows[0]) {
        const currentBottles = (inv.rows[0].quantity_cases * bpc) + (inv.rows[0].quantity_units || 0);
        const restored = currentBottles + parseInt(entry.quantity_units);
        const valueRestore = parseInt(entry.quantity_units) * pricePerBottle;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3
           WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(restored / bpc), restored % bpc, valueRestore, entry.godown_id, entry.product_id]
        );
      }
    }

    await client.query(`DELETE FROM free_products WHERE id=$1`, [req.params.id]);
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