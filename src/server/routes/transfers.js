const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET ALL
router.get('/', auth, async (req, res) => {
  try {
    const transfers = await pool.query(`
      SELECT t.*, 
        fg.name as from_godown_name, tg.name as to_godown_name
      FROM transfers t
      JOIN godowns fg ON t.from_godown_id = fg.id
      JOIN godowns tg ON t.to_godown_id = tg.id
      ORDER BY t.created_at DESC
    `);

    const items = await pool.query(`
      SELECT ti.*, p.name as product_name, p.bottles_per_case
      FROM transfer_items ti
      JOIN products p ON ti.product_id = p.id
    `);

    const result = transfers.rows.map(t => ({
      ...t,
      items: items.rows.filter(i => i.transfer_id === t.id)
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - create transfer
router.post('/', auth, async (req, res) => {
  const { from_godown_id, to_godown_id, notes, items } = req.body;
  if (!from_godown_id || !to_godown_id || !items?.length)
    return res.status(400).json({ error: 'Missing required fields' });
  if (from_godown_id === to_godown_id)
    return res.status(400).json({ error: 'From and To godowns must be different' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const transfer = await client.query(
      `INSERT INTO transfers (from_godown_id, to_godown_id, notes) VALUES ($1,$2,$3) RETURNING *`,
      [from_godown_id, to_godown_id, notes || null]
    );
    const transfer_id = transfer.rows[0].id;

    for (const item of items) {
      const { product_id, quantity_cases, quantity_units } = item;

      const prod = await client.query(`SELECT bottles_per_case, selling_price FROM products WHERE id=$1`, [product_id]);
      const bpc = parseInt(prod.rows[0].bottles_per_case);
      const pricePerBottle = parseFloat(prod.rows[0].selling_price) / bpc;
      const transferBottles = (parseInt(quantity_cases || 0) * bpc) + parseInt(quantity_units || 0);
      if (transferBottles <= 0) continue;

      const fromInv = await client.query(
        `SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [from_godown_id, product_id]
      );
      if (!fromInv.rows[0]) throw new Error(`No stock found in source godown for one of the products`);

      const fromTotal = (parseInt(fromInv.rows[0].quantity_cases) * bpc) + parseInt(fromInv.rows[0].quantity_units || 0);
      if (fromTotal < transferBottles) throw new Error(`Insufficient stock for ${prod.rows[0].name || 'a product'}. Available: ${Math.floor(fromTotal / bpc)}C ${fromTotal % bpc}B`);

      const fromRemaining = fromTotal - transferBottles;
      const valueAmount = transferBottles * pricePerBottle;

      await client.query(
        `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value - $3 WHERE godown_id=$4 AND product_id=$5`,
        [Math.floor(fromRemaining / bpc), fromRemaining % bpc, valueAmount, from_godown_id, product_id]
      );

      const toInv = await client.query(
        `SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`,
        [to_godown_id, product_id]
      );
      if (toInv.rows[0]) {
        const toTotal = (parseInt(toInv.rows[0].quantity_cases) * bpc) + parseInt(toInv.rows[0].quantity_units || 0) + transferBottles;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3 WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(toTotal / bpc), toTotal % bpc, valueAmount, to_godown_id, product_id]
        );
      } else {
        await client.query(
          `INSERT INTO inventory (godown_id, product_id, quantity_cases, quantity_units, stock_value, selling_price_per_case, selling_price_per_unit)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [to_godown_id, product_id, Math.floor(transferBottles / bpc), transferBottles % bpc, valueAmount,
           parseFloat(prod.rows[0].selling_price), pricePerBottle]
        );
      }

      await client.query(
        `INSERT INTO transfer_items (transfer_id, product_id, quantity_cases, quantity_units) VALUES ($1,$2,$3,$4)`,
        [transfer_id, product_id, parseInt(quantity_cases || 0), parseInt(quantity_units || 0)]
      );
    }

    await client.query('COMMIT');
    res.json(transfer.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT - edit transfer
router.put('/:id', auth, async (req, res) => {
  const { items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const transfer = await client.query(`SELECT * FROM transfers WHERE id=$1`, [req.params.id]);
    if (!transfer.rows[0]) throw new Error('Transfer not found');
    const { from_godown_id, to_godown_id } = transfer.rows[0];

    const oldItems = await client.query(
      `SELECT ti.*, p.bottles_per_case, p.selling_price FROM transfer_items ti JOIN products p ON ti.product_id = p.id WHERE ti.transfer_id=$1`,
      [req.params.id]
    );

    // Reverse old transfers
    for (const old of oldItems.rows) {
      const bpc = parseInt(old.bottles_per_case);
      const pricePerBottle = parseFloat(old.selling_price) / bpc;
      const oldBottles = (parseInt(old.quantity_cases) * bpc) + parseInt(old.quantity_units || 0);
      const valueAmount = oldBottles * pricePerBottle;

      const fromInv = await client.query(`SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`, [from_godown_id, old.product_id]);
      if (fromInv.rows[0]) {
        const restored = (parseInt(fromInv.rows[0].quantity_cases) * bpc) + parseInt(fromInv.rows[0].quantity_units || 0) + oldBottles;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3 WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(restored / bpc), restored % bpc, valueAmount, from_godown_id, old.product_id]
        );
      }

      const toInv = await client.query(`SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`, [to_godown_id, old.product_id]);
      if (toInv.rows[0]) {
        const deducted = (parseInt(toInv.rows[0].quantity_cases) * bpc) + parseInt(toInv.rows[0].quantity_units || 0) - oldBottles;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value - $3 WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(Math.max(0, deducted) / bpc), Math.max(0, deducted) % bpc, valueAmount, to_godown_id, old.product_id]
        );
      }
    }

    // Delete old items
    await client.query(`DELETE FROM transfer_items WHERE transfer_id=$1`, [req.params.id]);

    // Apply new transfers
    for (const item of items) {
      const { product_id, quantity_cases, quantity_units } = item;
      const prod = await client.query(`SELECT bottles_per_case, selling_price FROM products WHERE id=$1`, [product_id]);
      const bpc = parseInt(prod.rows[0].bottles_per_case);
      const pricePerBottle = parseFloat(prod.rows[0].selling_price) / bpc;
      const transferBottles = (parseInt(quantity_cases || 0) * bpc) + parseInt(quantity_units || 0);
      if (transferBottles <= 0) continue;

      const fromInv = await client.query(`SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`, [from_godown_id, product_id]);
      if (!fromInv.rows[0]) throw new Error('No stock in source godown');
      const fromTotal = (parseInt(fromInv.rows[0].quantity_cases) * bpc) + parseInt(fromInv.rows[0].quantity_units || 0);
      if (fromTotal < transferBottles) throw new Error(`Insufficient stock. Available: ${Math.floor(fromTotal / bpc)}C ${fromTotal % bpc}B`);

      const fromRemaining = fromTotal - transferBottles;
      const valueAmount = transferBottles * pricePerBottle;

      await client.query(
        `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value - $3 WHERE godown_id=$4 AND product_id=$5`,
        [Math.floor(fromRemaining / bpc), fromRemaining % bpc, valueAmount, from_godown_id, product_id]
      );

      const toInv = await client.query(`SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`, [to_godown_id, product_id]);
      if (toInv.rows[0]) {
        const toTotal = (parseInt(toInv.rows[0].quantity_cases) * bpc) + parseInt(toInv.rows[0].quantity_units || 0) + transferBottles;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3 WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(toTotal / bpc), toTotal % bpc, valueAmount, to_godown_id, product_id]
        );
      } else {
        await client.query(
          `INSERT INTO inventory (godown_id, product_id, quantity_cases, quantity_units, stock_value, selling_price_per_case, selling_price_per_unit)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [to_godown_id, product_id, Math.floor(transferBottles / bpc), transferBottles % bpc, valueAmount,
           parseFloat(prod.rows[0].selling_price), pricePerBottle]
        );
      }

      await client.query(
        `INSERT INTO transfer_items (transfer_id, product_id, quantity_cases, quantity_units) VALUES ($1,$2,$3,$4)`,
        [req.params.id, product_id, parseInt(quantity_cases || 0), parseInt(quantity_units || 0)]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Transfer updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const transfer = await client.query(`SELECT * FROM transfers WHERE id=$1`, [req.params.id]);
    if (!transfer.rows[0]) throw new Error('Transfer not found');
    const { from_godown_id, to_godown_id } = transfer.rows[0];

    const items = await client.query(
      `SELECT ti.*, p.bottles_per_case, p.selling_price FROM transfer_items ti JOIN products p ON ti.product_id = p.id WHERE ti.transfer_id=$1`,
      [req.params.id]
    );

    for (const item of items.rows) {
      const bpc = parseInt(item.bottles_per_case);
      const pricePerBottle = parseFloat(item.selling_price) / bpc;
      const bottles = (parseInt(item.quantity_cases) * bpc) + parseInt(item.quantity_units || 0);
      const valueAmount = bottles * pricePerBottle;

      const fromInv = await client.query(`SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`, [from_godown_id, item.product_id]);
      if (fromInv.rows[0]) {
        const restored = (parseInt(fromInv.rows[0].quantity_cases) * bpc) + parseInt(fromInv.rows[0].quantity_units || 0) + bottles;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value + $3 WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(restored / bpc), restored % bpc, valueAmount, from_godown_id, item.product_id]
        );
      }

      const toInv = await client.query(`SELECT * FROM inventory WHERE godown_id=$1 AND product_id=$2`, [to_godown_id, item.product_id]);
      if (toInv.rows[0]) {
        const deducted = (parseInt(toInv.rows[0].quantity_cases) * bpc) + parseInt(toInv.rows[0].quantity_units || 0) - bottles;
        await client.query(
          `UPDATE inventory SET quantity_cases=$1, quantity_units=$2, stock_value = stock_value - $3 WHERE godown_id=$4 AND product_id=$5`,
          [Math.floor(Math.max(0, deducted) / bpc), Math.max(0, deducted) % bpc, valueAmount, to_godown_id, item.product_id]
        );
      }
    }

    await client.query(`DELETE FROM transfers WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Transfer deleted and inventory restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;