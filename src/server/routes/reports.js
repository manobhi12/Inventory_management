const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const ExcelJS = require('exceljs');

// ─── HELPERS ───────────────────────────────────────────────
const headerStyle = (row) => {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'medium' } };
  });
  row.height = 22;
};

const sectionHeader = (sheet, title, cols) => {
  const row = sheet.addRow([title]);
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } };
  row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  sheet.mergeCells(`A${row.number}:${String.fromCharCode(64 + cols)}${row.number}`);
  row.height = 20;
  sheet.addRow([]);
};

const statusFill = (status) => {
  if (status === 'CLEARED' || status === 'PAID') return 'FFD1FAE5';
  if (status === 'PARTIAL') return 'FFFEF3C7';
  return 'FFFEE2E2';
};

const addBillsSheet = async (sheet, bills, pool) => {
  sheet.columns = [
    { key: 'bill', width: 10 }, { key: 'date', width: 14 }, { key: 'shop', width: 22 },
    { key: 'product', width: 25 }, { key: 'cases', width: 8 }, { key: 'bottles', width: 10 },
    { key: 'item_total', width: 14 }, { key: 'bill_total', width: 14 },
    { key: 'paid', width: 14 }, { key: 'pending', width: 14 }, { key: 'status', width: 12 },
  ];
  const hRow = sheet.addRow(['Bill No', 'Date', 'Shop', 'Product', 'Cases', 'Bottles', 'Item Total', 'Bill Total', 'Paid', 'Pending', 'Status']);
  headerStyle(hRow);

  let grandTotal = 0, grandPaid = 0, grandPending = 0;

  for (const bill of bills) {
    const items = (await pool.query(`SELECT bi.*, p.name as product_name FROM bill_items bi JOIN products p ON bi.product_id=p.id WHERE bi.bill_id=$1`, [bill.id])).rows;
    items.forEach((item, idx) => {
      const row = sheet.addRow([
        idx === 0 ? bill.bill_number : '',
        idx === 0 ? new Date(bill.created_at).toLocaleDateString('en-IN') : '',
        idx === 0 ? bill.shop_name : '',
        item.product_name,
        item.quantity_cases,
        item.quantity_units || 0,
        parseFloat(item.total_price),
        idx === 0 ? parseFloat(bill.total_amount) : '',
        idx === 0 ? parseFloat(bill.paid_amount || 0) : '',
        idx === 0 ? parseFloat(bill.pending_amount || 0) : '',
        idx === 0 ? bill.status : '',
      ]);
      row.getCell(7).numFmt = '₹#,##0.00';
      if (idx === 0) {
        [8, 9, 10].forEach(c => { row.getCell(c).numFmt = '₹#,##0.00'; row.getCell(c).font = { bold: true }; });
        row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill(bill.status) } };
        row.getCell(11).font = { bold: true };
        [1, 2, 3].forEach(c => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; row.getCell(c).font = { bold: true }; });
      }
      row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    });
    sheet.addRow(['']);
    grandTotal += parseFloat(bill.total_amount);
    grandPaid += parseFloat(bill.paid_amount || 0);
    grandPending += parseFloat(bill.pending_amount || 0);
  }

  const tRow = sheet.addRow(['', '', '', 'GRAND TOTAL', '', '', '', grandTotal, grandPaid, grandPending, '']);
  tRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; });
  [8, 9, 10].forEach(c => { tRow.getCell(c).numFmt = '₹#,##0.00'; });
  tRow.height = 22;
};

const addCounterSheet = async (sheet, sales) => {
  sheet.columns = [
    { key: 'sale', width: 14 }, { key: 'date', width: 14 }, { key: 'time', width: 12 },
    { key: 'product', width: 25 }, { key: 'bottles', width: 12 },
    { key: 'price', width: 14 }, { key: 'total', width: 14 },
  ];
  const hRow = sheet.addRow(['Sale #', 'Date', 'Time', 'Product', 'Bottles Sold', 'Price/Bottle', 'Total']);
  headerStyle(hRow);

  let grandTotal = 0;
  sales.forEach(s => {
    const row = sheet.addRow([
      s.sale_number || '—',
      new Date(s.created_at).toLocaleDateString('en-IN'),
      new Date(s.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      s.product_name,
      s.quantity_units,
      parseFloat(s.price_per_unit),
      parseFloat(s.total_amount),
    ]);
    row.getCell(6).numFmt = '₹#,##0.00';
    row.getCell(7).numFmt = '₹#,##0.00';
    row.getCell(7).font = { bold: true };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    grandTotal += parseFloat(s.total_amount);
  });

  sheet.addRow([]);
  const tRow = sheet.addRow(['', '', '', 'TOTAL', '', '', grandTotal]);
  tRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; });
  tRow.getCell(7).numFmt = '₹#,##0.00';
  tRow.height = 22;
};

const addPurchasesSheet = async (sheet, purchases, pool) => {
  sheet.columns = [
    { key: 'date', width: 14 }, { key: 'company', width: 22 }, { key: 'product', width: 25 },
    { key: 'cases', width: 10 }, { key: 'price', width: 14 }, { key: 'item_total', width: 14 },
    { key: 'gst', width: 12 }, { key: 'transport', width: 14 }, { key: 'bill_total', width: 14 },
    { key: 'paid', width: 14 }, { key: 'pending', width: 14 }, { key: 'status', width: 12 },
  ];
  const hRow = sheet.addRow(['Date', 'Company', 'Product', 'Cases', 'Price/Case', 'Item Total', 'GST', 'Transport', 'Bill Total', 'Paid', 'Pending', 'Status']);
  headerStyle(hRow);

  let grandTotal = 0, grandPaid = 0, grandPending = 0;
  for (const p of purchases) {
    const items = (await pool.query(`SELECT pi.*, pr.name as product_name FROM purchase_items pi JOIN products pr ON pi.product_id=pr.id WHERE pi.purchase_id=$1`, [p.id])).rows;
    items.forEach((item, idx) => {
      const row = sheet.addRow([
        idx === 0 ? new Date(p.purchase_date).toLocaleDateString('en-IN') : '',
        idx === 0 ? p.company_name : '',
        item.product_name,
        item.quantity_cases,
        parseFloat(item.price_per_case),
        parseFloat(item.total_price),
        idx === 0 ? parseFloat(p.gst_amount || 0) : '',
        idx === 0 ? parseFloat(p.transport_cost || 0) : '',
        idx === 0 ? parseFloat(p.total_amount) : '',
        idx === 0 ? parseFloat(p.paid_amount || 0) : '',
        idx === 0 ? Math.max(0, parseFloat(p.total_amount) - parseFloat(p.paid_amount || 0)) : '',
        idx === 0 ? p.payment_status : '',
      ]);
      [5, 6, 7, 8, 9, 10].forEach(c => row.getCell(c).numFmt = '₹#,##0.00');
      if (idx === 0) {
        [1, 2].forEach(c => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; row.getCell(c).font = { bold: true }; });
        row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill(p.payment_status) } };
        row.getCell(12).font = { bold: true };
      }
      row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    });
    sheet.addRow([]);
    grandTotal += parseFloat(p.total_amount);
    grandPaid += parseFloat(p.paid_amount || 0);
    grandPending += Math.max(0, parseFloat(p.total_amount) - parseFloat(p.paid_amount || 0));
  }

  const tRow = sheet.addRow(['', '', 'GRAND TOTAL', '', '', '', '', '', grandTotal, grandPaid, grandPending, '']);
  tRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; });
  [9, 10, 11].forEach(c => tRow.getCell(c).numFmt = '₹#,##0.00');
  tRow.height = 22;
};

const addExpensesSheet = async (sheet, expenses, freeProducts, breakages) => {
  sheet.columns = [
    { key: 'date', width: 14 }, { key: 'type', width: 20 }, { key: 'desc', width: 30 }, { key: 'amount', width: 16 },
  ];

  sectionHeader(sheet, 'REGULAR EXPENSES', 4);
  const hRow1 = sheet.addRow(['Date', 'Type', 'Description', 'Amount']);
  headerStyle(hRow1);

  let expTotal = 0;
  expenses.forEach(e => {
    const row = sheet.addRow([
      new Date(e.expense_date || e.created_at).toLocaleDateString('en-IN'),
      e.type,
      e.description || '—',
      parseFloat(e.amount),
    ]);
    row.getCell(4).numFmt = '₹#,##0.00';
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    expTotal += parseFloat(e.amount);
  });
  const eTRow = sheet.addRow(['', '', 'Expenses Total', expTotal]);
  eTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  eTRow.getCell(4).numFmt = '₹#,##0.00';
  sheet.addRow([]);
  sheet.addRow([]);

  sectionHeader(sheet, 'FREE PRODUCTS GIVEN', 4);
  const hRow2 = sheet.addRow(['Date', 'Product', 'Bottles Given', 'Approx Value']);
  headerStyle(hRow2);

  let freeTotal = 0;
  freeProducts.forEach(f => {
    const approxValue = parseFloat(f.quantity_units || 0) * parseFloat(f.selling_price_per_unit || 0);
    const row = sheet.addRow([
      new Date(f.given_date || f.created_at).toLocaleDateString('en-IN'),
      f.product_name,
      f.quantity_units || 0,
      approxValue,
    ]);
    row.getCell(4).numFmt = '₹#,##0.00';
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    freeTotal += approxValue;
  });
  const fTRow = sheet.addRow(['', '', 'Free Products Total', freeTotal]);
  fTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  fTRow.getCell(4).numFmt = '₹#,##0.00';
  sheet.addRow([]);
  sheet.addRow([]);

  sectionHeader(sheet, 'BREAKAGE', 4);
  const hRow3 = sheet.addRow(['Date', 'Product', 'Bottles Broken', 'Penalty Amount']);
  headerStyle(hRow3);

  let breakTotal = 0;
  breakages.forEach(b => {
    const row = sheet.addRow([
      new Date(b.breakage_date).toLocaleDateString('en-IN'),
      b.product_name,
      b.quantity_bottles,
      parseFloat(b.total_penalty),
    ]);
    row.getCell(4).numFmt = '₹#,##0.00';
    row.getCell(4).font = { color: { argb: 'FFC8102E' } };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    breakTotal += parseFloat(b.total_penalty);
  });
  const bTRow = sheet.addRow(['', '', 'Breakage Total', breakTotal]);
  bTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  bTRow.getCell(4).numFmt = '₹#,##0.00';
  sheet.addRow([]);
  sheet.addRow([]);

  sectionHeader(sheet, 'EXPENSE SUMMARY', 4);
  const summaryRows = [
    ['Regular Expenses', expTotal],
    ['Free Products (Value)', freeTotal],
    ['Breakage Penalties', breakTotal],
    ['TOTAL OUTFLOW', expTotal + freeTotal + breakTotal],
  ];
  summaryRows.forEach((s, idx) => {
    const row = sheet.addRow(['', s[0], '', s[1]]);
    row.getCell(4).numFmt = '₹#,##0.00';
    if (idx === summaryRows.length - 1) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }; });
    } else {
      row.getCell(2).font = { bold: true };
    }
    row.height = 18;
  });
};

// ─── DELIVERY SHEET ──────────────────────────────────────
const addDeliverySheet = async (sheet, from, to, gid, pool) => {
  const billsAnd = gid ? `AND b.godown_id='${gid}'` : '';
  const gAnd = gid ? `AND godown_id='${gid}'` : '';

  // ── Section 1: Driver + Route summary ──
  sectionHeader(sheet, 'DRIVER & ROUTE SUMMARY', 7);

  sheet.columns = [
    { key: 'driver', width: 20 },
    { key: 'route', width: 20 },
    { key: 'date', width: 14 },
    { key: 'delivered', width: 18 },
    { key: 'collected', width: 18 },
    { key: 'pending', width: 18 },
    { key: 'free', width: 18 },
  ];

  const hRow1 = sheet.addRow(['Driver', 'Route', 'Delivery Date', 'Value Delivered', 'Amount Collected', 'Pending', 'Free Products Value']);
  headerStyle(hRow1);

  // Fetch bills with driver, route (via shop), delivery_date
  const billsRes = await pool.query(`
    SELECT
      b.id, b.total_amount, b.paid_amount, b.pending_amount,
      b.delivery_date, b.driver_id, b.shop_id,
      d.name as driver_name,
      s.route_id,
      r.name as route_name
    FROM bills b
    JOIN shops s ON s.id = b.shop_id
    LEFT JOIN drivers d ON d.id = b.driver_id
    LEFT JOIN routes r ON r.id = s.route_id
    WHERE b.delivery_date BETWEEN '${from}' AND '${to}'
      AND b.driver_id IS NOT NULL
      ${billsAnd}
    ORDER BY b.delivery_date, d.name, r.name
  `);

  // Group by driver_id + route_id + delivery_date
  const driverRouteMap = {};
  for (const bill of billsRes.rows) {
    const key = `${bill.driver_id}__${bill.route_id || 'none'}__${bill.delivery_date}`;
    if (!driverRouteMap[key]) {
      driverRouteMap[key] = {
        driver_name: bill.driver_name || '—',
        route_name: bill.route_name || '—',
        delivery_date: bill.delivery_date,
        route_id: bill.route_id,
        total_delivered: 0,
        total_collected: 0,
        total_pending: 0,
      };
    }
    driverRouteMap[key].total_delivered += parseFloat(bill.total_amount || 0);
    driverRouteMap[key].total_collected += parseFloat(bill.paid_amount || 0);
    driverRouteMap[key].total_pending += parseFloat(bill.pending_amount || 0);
  }

  // For each group fetch free products value (shop on that route, given on that delivery_date)
  for (const key of Object.keys(driverRouteMap)) {
    const group = driverRouteMap[key];
    if (group.route_id) {
      const freeRes = await pool.query(`
        SELECT COALESCE(SUM(fp.quantity_units * p.selling_price_per_unit), 0) as free_value
        FROM free_products fp
        JOIN shops s ON s.id = fp.shop_id
        JOIN products p ON p.id = fp.product_id
        WHERE s.route_id = $1
          AND fp.given_date = $2
      `, [group.route_id, group.delivery_date]);
      group.free_value = parseFloat(freeRes.rows[0].free_value || 0);
    } else {
      group.free_value = 0;
    }
  }

  let driverGrandDelivered = 0, driverGrandCollected = 0, driverGrandPending = 0, driverGrandFree = 0;

  Object.values(driverRouteMap).forEach(g => {
    const row = sheet.addRow([
      g.driver_name,
      g.route_name,
      new Date(g.delivery_date).toLocaleDateString('en-IN'),
      g.total_delivered,
      g.total_collected,
      g.total_pending,
      g.free_value,
    ]);
    [4, 5, 6, 7].forEach(c => {
      row.getCell(c).numFmt = '₹#,##0.00';
      row.getCell(c).font = { bold: true };
    });
    row.getCell(6).font = { bold: true, color: { argb: 'FFC8102E' } };
    row.getCell(7).font = { bold: true, color: { argb: 'FF7C3AED' } };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    driverGrandDelivered += g.total_delivered;
    driverGrandCollected += g.total_collected;
    driverGrandPending += g.total_pending;
    driverGrandFree += g.free_value;
  });

  const dTRow = sheet.addRow(['TOTAL', '', '', driverGrandDelivered, driverGrandCollected, driverGrandPending, driverGrandFree]);
  dTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; });
  [4, 5, 6, 7].forEach(c => dTRow.getCell(c).numFmt = '₹#,##0.00');
  dTRow.height = 22;

  sheet.addRow([]);
  sheet.addRow([]);

  // ── Section 2: Product-wise sales summary ──
  sectionHeader(sheet, 'PRODUCT-WISE SALES (SHOP BILLS)', 6);

  const prodHRow = sheet.addRow(['Product', 'Cases Sold', 'Extra Bottles', 'Total Bottles', 'Total Value', '']);
  headerStyle(prodHRow);

  const prodRes = await pool.query(`
    SELECT
      p.name as product_name,
      p.bottles_per_case,
      SUM(bi.quantity_cases) as total_cases,
      SUM(bi.quantity_units) as total_extra_bottles,
      SUM(bi.total_price) as total_value
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN products p ON p.id = bi.product_id
    WHERE b.delivery_date BETWEEN '${from}' AND '${to}'
      ${billsAnd}
    GROUP BY p.id, p.name, p.bottles_per_case
    ORDER BY total_value DESC
  `);

  let prodGrandValue = 0;
  prodRes.rows.forEach(p => {
    const bpc = parseInt(p.bottles_per_case) || 24;
    const totalBottles = (parseInt(p.total_cases || 0) * bpc) + parseInt(p.total_extra_bottles || 0);
    const row = sheet.addRow([
      p.product_name,
      parseInt(p.total_cases || 0),
      parseInt(p.total_extra_bottles || 0),
      totalBottles,
      parseFloat(p.total_value || 0),
      '',
    ]);
    row.getCell(1).font = { bold: true };
    row.getCell(5).numFmt = '₹#,##0.00';
    row.getCell(5).font = { bold: true };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    prodGrandValue += parseFloat(p.total_value || 0);
  });

  const pTRow = sheet.addRow(['TOTAL', '', '', '', prodGrandValue, '']);
  pTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; });
  pTRow.getCell(5).numFmt = '₹#,##0.00';
  pTRow.height = 22;

  sheet.addRow([]);
  sheet.addRow([]);

  // ── Section 3: Shop-wise pending ──
  sectionHeader(sheet, 'SHOP-WISE OUTSTANDING (ALL TIME)', 5);

  const shopHRow = sheet.addRow(['Shop', 'Route', 'Total Billed', 'Total Paid', 'Pending']);
  headerStyle(shopHRow);

  const shopRes = await pool.query(`
    SELECT
      s.name as shop_name,
      r.name as route_name,
      COALESCE(SUM(b.total_amount), 0) as total_billed,
      COALESCE(SUM(b.paid_amount), 0) as total_paid,
      COALESCE(SUM(b.pending_amount), 0) as total_pending
    FROM shops s
    LEFT JOIN bills b ON b.shop_id = s.id ${gid ? `AND b.godown_id='${gid}'` : ''}
    LEFT JOIN routes r ON r.id = s.route_id
    GROUP BY s.id, s.name, r.name
    HAVING COALESCE(SUM(b.pending_amount), 0) > 0
    ORDER BY total_pending DESC
  `);

  let shopGrandBilled = 0, shopGrandPaid = 0, shopGrandPending = 0;
  shopRes.rows.forEach(s => {
    const row = sheet.addRow([
      s.shop_name,
      s.route_name || '—',
      parseFloat(s.total_billed),
      parseFloat(s.total_paid),
      parseFloat(s.total_pending),
    ]);
    row.getCell(1).font = { bold: true };
    [3, 4].forEach(c => row.getCell(c).numFmt = '₹#,##0.00');
    row.getCell(5).numFmt = '₹#,##0.00';
    row.getCell(5).font = { bold: true, color: { argb: 'FFC8102E' } };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    shopGrandBilled += parseFloat(s.total_billed);
    shopGrandPaid += parseFloat(s.total_paid);
    shopGrandPending += parseFloat(s.total_pending);
  });

  const sTRow = sheet.addRow(['TOTAL', '', shopGrandBilled, shopGrandPaid, shopGrandPending]);
  sTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; });
  [3, 4, 5].forEach(c => sTRow.getCell(c).numFmt = '₹#,##0.00');
  sTRow.height = 22;
};

// ─── DAILY SUMMARY SHEET ─────────────────────────────────
const addDailySummarySheet = async (sheet, date, gid, pool) => {
  const gAnd    = gid ? `AND godown_id='${gid}'` : '';
  const gBillsAnd = gid ? `AND b.godown_id='${gid}'` : '';
  const gCsAnd  = gid ? `AND cs.godown_id='${gid}'` : '';
  const gPuAnd  = gid ? `AND pu.godown_id='${gid}'` : '';
  const gExpAnd = gid ? `AND fp.godown_id='${gid}'` : '';
  const gExpenses = gid ? `AND godown_id='${gid}'` : '';
  const gBreak = gid ? `AND br.godown_id='${gid}'` : '';

  sheet.columns = [
    { key: 'a', width: 32 },
    { key: 'b', width: 22 },
    { key: 'c', width: 22 },
    { key: 'd', width: 22 },
    { key: 'e', width: 22 },
    { key: 'f', width: 22 },
  ];

  // Helper to add a titled value row (label | value)
  const kv = (label, value, labelArgb, valueArgb, numFmt) => {
    const row = sheet.addRow([label, value]);
    if (labelArgb) row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: labelArgb } };
    row.getCell(1).font = { bold: true, color: { argb: labelArgb ? 'FFFFFFFF' : 'FF111111' }, size: 11 };
    row.getCell(2).font = { bold: true, size: 12, color: { argb: valueArgb || 'FF111111' } };
    row.getCell(2).numFmt = numFmt || '₹#,##0.00';
    row.getCell(2).alignment = { horizontal: 'right' };
    row.height = 20;
    return row;
  };

  const blank = () => sheet.addRow([]);
  const divider = (title) => {
    blank();
    const row = sheet.addRow([title]);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } };
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    row.height = 20;
    blank();
  };

  // ── TITLE ──
  const titleRow = sheet.addRow([`DAILY SUMMARY — ${new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`]);
  sheet.mergeCells(`A${titleRow.number}:F${titleRow.number}`);
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  titleRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 32;
  blank();

  // ── 1. OPENING STOCK (inventory value at start of day = current value + today's outflows) ──
  // We approximate: opening stock = current stock_value + today's bill items cost + today's counter sales cost
  const currentStockRes = await pool.query(
    `SELECT COALESCE(SUM(stock_value), 0) as val FROM inventory ${gid ? `WHERE godown_id='${gid}'` : ''}`
  );
  const currentStock = parseFloat(currentStockRes.rows[0].val);

  // Cost of goods sold today via bills (use selling price as proxy since stock_value tracks selling price)
  const billCostTodayRes = await pool.query(`
    SELECT COALESCE(SUM(bi.total_price), 0) as val
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE DATE(b.created_at) = '${date}' ${gBillsAnd}
  `);
  const billCostToday = parseFloat(billCostTodayRes.rows[0].val);

  // Cost of counter sales today
  const csCostTodayRes = await pool.query(`
    SELECT COALESCE(SUM(cs.total_amount), 0) as val
    FROM counter_sales cs
    WHERE DATE(cs.created_at) = '${date}' ${gCsAnd}
  `);
  const csCostToday = parseFloat(csCostTodayRes.rows[0].val);

  // Purchases today added to stock
  const purchasesTodayRes = await pool.query(`
    SELECT COALESCE(SUM(pu.total_amount), 0) as val
    FROM purchases pu
    WHERE DATE(pu.purchase_date) = '${date}' ${gPuAnd}
  `);
  const purchasesToday = parseFloat(purchasesTodayRes.rows[0].val);

  const openingStock = currentStock + billCostToday + csCostToday - purchasesToday;

  divider('📦  STOCK', 2);
  kv('Opening Stock Value', openingStock, 'FF1D4ED8');
  kv('Purchases Today (Added)', purchasesToday, null, 'FF16a34a');

  // ── 2. ROUTE + DRIVER breakdown ──
  divider('🚛  DELIVERIES BY DRIVER & ROUTE', 6);

  const delivHRow = sheet.addRow(['Driver', 'Route', 'Stock Value Sent', 'Amount Collected', 'Pending', 'Free Products Value']);
  headerStyle(delivHRow);

  const delivRes = await pool.query(`
    SELECT
      d.name as driver_name,
      r.name as route_name,
      COALESCE(SUM(b.total_amount), 0) as total_delivered,
      COALESCE(SUM(b.paid_amount), 0) as total_collected,
      COALESCE(SUM(b.pending_amount), 0) as total_pending,
      s.route_id
    FROM bills b
    JOIN shops s ON s.id = b.shop_id
    LEFT JOIN drivers d ON d.id = b.driver_id
    LEFT JOIN routes r ON r.id = s.route_id
    WHERE DATE(b.delivery_date) = '${date}'
      AND b.driver_id IS NOT NULL
      ${gBillsAnd}
    GROUP BY d.name, r.name, s.route_id
    ORDER BY d.name, r.name
  `);

  let dTotalDelivered = 0, dTotalCollected = 0, dTotalPending = 0, dTotalFree = 0;

  for (const g of delivRes.rows) {
    let freeVal = 0;
    if (g.route_id) {
      const fRes = await pool.query(`
        SELECT COALESCE(SUM(fp.quantity_units * p.selling_price_per_unit), 0) as v
        FROM free_products fp
        JOIN shops sh ON sh.id = fp.shop_id
        JOIN products p ON p.id = fp.product_id
        WHERE sh.route_id = $1 AND fp.given_date = $2
      `, [g.route_id, date]);
      freeVal = parseFloat(fRes.rows[0].v || 0);
    }
    const row = sheet.addRow([
      g.driver_name || '—',
      g.route_name || '—',
      parseFloat(g.total_delivered),
      parseFloat(g.total_collected),
      parseFloat(g.total_pending),
      freeVal,
    ]);
    [3,4,5,6].forEach(c => { row.getCell(c).numFmt = '₹#,##0.00'; row.getCell(c).font = { bold: true }; });
    row.getCell(5).font = { bold: true, color: { argb: 'FFC8102E' } };
    row.getCell(6).font = { bold: true, color: { argb: 'FF7C3AED' } };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    dTotalDelivered += parseFloat(g.total_delivered);
    dTotalCollected += parseFloat(g.total_collected);
    dTotalPending += parseFloat(g.total_pending);
    dTotalFree += freeVal;
  }

  if (delivRes.rows.length === 0) sheet.addRow(['No deliveries today', '', '', '', '', '']);

  const dTRow = sheet.addRow(['TOTAL', '', dTotalDelivered, dTotalCollected, dTotalPending, dTotalFree]);
  dTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  [3,4,5,6].forEach(c => dTRow.getCell(c).numFmt = '₹#,##0.00');
  dTRow.height = 20;

  // ── 3. COUNTER SALES ──
  divider('🏪  COUNTER SALES', 3);

  const csRes = await pool.query(`
    SELECT
      p.name as product_name,
      SUM(csi.quantity_units) as bottles,
      SUM(csi.total_amount) as total,
      SUM(CASE WHEN cs.payment_mode = 'ONLINE' THEN csi.total_amount ELSE 0 END) as online_total,
      SUM(CASE WHEN cs.payment_mode IN ('CASH','SPLIT') OR cs.payment_mode IS NULL THEN csi.total_amount ELSE 0 END) as cash_total
    FROM counter_sales cs
    JOIN counter_sale_items csi ON csi.counter_sale_id = cs.id
    JOIN products p ON p.id = csi.product_id
    WHERE DATE(cs.created_at) = '${date}' ${gCsAnd}
    GROUP BY p.name
    ORDER BY total DESC
  `);

  const csHRow = sheet.addRow(['Product', 'Bottles Sold', 'Cash', 'Online', 'Total']);
  headerStyle(csHRow);

  let csTotalCash = 0, csTotalOnline = 0, csGrandTotal = 0;
  csRes.rows.forEach(cs => {
    const row = sheet.addRow([
      cs.product_name,
      parseInt(cs.bottles),
      parseFloat(cs.cash_total),
      parseFloat(cs.online_total),
      parseFloat(cs.total),
    ]);
    [3,4,5].forEach(c => row.getCell(c).numFmt = '₹#,##0.00');
    row.getCell(5).font = { bold: true };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    csTotalCash += parseFloat(cs.cash_total);
    csTotalOnline += parseFloat(cs.online_total);
    csGrandTotal += parseFloat(cs.total);
  });

  if (csRes.rows.length === 0) sheet.addRow(['No counter sales today', '', '', '', '']);

  const csTRow = sheet.addRow(['TOTAL', '', csTotalCash, csTotalOnline, csGrandTotal]);
  csTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  [3,4,5].forEach(c => csTRow.getCell(c).numFmt = '₹#,##0.00');
  csTRow.height = 20;

  // ── 4. ALL SHOPS PENDING (all time) ──
  divider('⏳  SHOP-WISE PENDING (ALL TIME)', 4);

  const shopHRow = sheet.addRow(['Shop', 'Route', 'Total Billed', 'Total Paid', 'Pending']);
  headerStyle(shopHRow);

  const shopRes = await pool.query(`
    SELECT
      s.name as shop_name,
      r.name as route_name,
      COALESCE(SUM(b.total_amount), 0) as total_billed,
      COALESCE(SUM(b.paid_amount), 0) as total_paid,
      COALESCE(SUM(b.pending_amount), 0) as total_pending
    FROM shops s
    LEFT JOIN bills b ON b.shop_id = s.id ${gid ? `AND b.godown_id='${gid}'` : ''}
    LEFT JOIN routes r ON r.id = s.route_id
    GROUP BY s.id, s.name, r.name
    HAVING COALESCE(SUM(b.pending_amount), 0) > 0
    ORDER BY total_pending DESC
  `);

  let shopGrandPending = 0;
  shopRes.rows.forEach(s => {
    const row = sheet.addRow([
      s.shop_name,
      s.route_name || '—',
      parseFloat(s.total_billed),
      parseFloat(s.total_paid),
      parseFloat(s.total_pending),
    ]);
    row.getCell(1).font = { bold: true };
    [3,4].forEach(c => row.getCell(c).numFmt = '₹#,##0.00');
    row.getCell(5).numFmt = '₹#,##0.00';
    row.getCell(5).font = { bold: true, color: { argb: 'FFC8102E' } };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    shopGrandPending += parseFloat(s.total_pending);
  });

  if (shopRes.rows.length === 0) sheet.addRow(['No pending amounts', '', '', '', '']);

  const sTRow = sheet.addRow(['TOTAL PENDING', '', '', '', shopGrandPending]);
  sTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  sTRow.getCell(5).numFmt = '₹#,##0.00';
  sTRow.height = 20;

  // ── 5. FREE PRODUCTS TODAY ──
  divider('🎁  FREE PRODUCTS GIVEN TODAY', 4);

  const freeRes = await pool.query(`
    SELECT
      p.name as product_name,
      s.name as shop_name,
      fp.quantity_units,
      fp.quantity_units * p.selling_price_per_unit as value
    FROM free_products fp
    JOIN products p ON p.id = fp.product_id
    LEFT JOIN shops s ON s.id = fp.shop_id
    WHERE fp.given_date = '${date}' ${gExpAnd}
    ORDER BY value DESC
  `);

  const freeHRow = sheet.addRow(['Product', 'Shop', 'Bottles', 'Value']);
  headerStyle(freeHRow);

  let freeTotalVal = 0;
  freeRes.rows.forEach(f => {
    const row = sheet.addRow([f.product_name, f.shop_name || '—', parseInt(f.quantity_units), parseFloat(f.value)]);
    row.getCell(4).numFmt = '₹#,##0.00';
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    freeTotalVal += parseFloat(f.value);
  });
  if (freeRes.rows.length === 0) sheet.addRow(['No free products today', '', '', '']);

  const fTRow2 = sheet.addRow(['TOTAL FREE VALUE', '', '', freeTotalVal]);
  fTRow2.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  fTRow2.getCell(4).numFmt = '₹#,##0.00';
  fTRow2.height = 20;

  // ── 6. EXPENSES + BREAKAGE TODAY ──
  divider('💸  EXPENSES & BREAKAGE TODAY', 3);

  const expRes = await pool.query(`
    SELECT type, COALESCE(notes, '') as description, amount
    FROM expenses
    WHERE DATE(expense_date) = '${date}' ${gExpenses}
    ORDER BY amount DESC
  `);

  const breakRes = await pool.query(`
    SELECT p.name as product_name, br.quantity_bottles, br.total_penalty, br.reason
    FROM breakage br
    JOIN products p ON p.id = br.product_id
    WHERE DATE(br.breakage_date) = '${date}' ${gBreak}
  `);

  const expHRow = sheet.addRow(['Type', 'Description', 'Amount']);
  headerStyle(expHRow);

  let expTotal = 0;
  expRes.rows.forEach(e => {
    const row = sheet.addRow([e.type, e.description || '—', parseFloat(e.amount)]);
    row.getCell(3).numFmt = '₹#,##0.00';
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    expTotal += parseFloat(e.amount);
  });
  if (expRes.rows.length === 0) sheet.addRow(['No expenses today', '', '']);

  let breakTotal = 0;
  breakRes.rows.forEach(b => {
    const row = sheet.addRow([`Breakage: ${b.product_name}`, `${b.quantity_bottles} bottles — ${b.reason || ''}`, parseFloat(b.total_penalty)]);
    row.getCell(1).font = { color: { argb: 'FFC8102E' } };
    row.getCell(3).numFmt = '₹#,##0.00';
    row.getCell(3).font = { bold: true, color: { argb: 'FFC8102E' } };
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    breakTotal += parseFloat(b.total_penalty);
  });

  const expTRow = sheet.addRow(['TOTAL OUTFLOW', '', expTotal + breakTotal]);
  expTRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  expTRow.getCell(3).numFmt = '₹#,##0.00';
  expTRow.height = 20;

  // ── 7. CLOSING SUMMARY BOX ──
  divider('📊  CLOSING SUMMARY', 2);

  const closingStock = currentStock;
  const totalOnlineBills = await pool.query(`
    SELECT COALESCE(SUM(total_amount), 0) as val
    FROM counter_sales
    WHERE DATE(created_at) = '${date}'
      ${gid ? `AND godown_id='${gid}'` : ''}
      AND payment_mode = 'ONLINE'
  `);
  const onlineTransactions = parseFloat(totalOnlineBills.rows[0].val);

  const summaryItems = [
    ['Opening Stock Value',       openingStock,                  'FF1D4ED8'],
    ['Purchases Added',           purchasesToday,                'FF059669'],
    ['Delivery Sales (Billed)',   dTotalDelivered,               'FF6D28D9'],
    ['Delivery Collected',        dTotalCollected,               'FF16A34A'],
    ['Delivery Pending',          dTotalPending,                 'FFC8102E'],
    ['Counter Sales',             csGrandTotal,                  'FF6D28D9'],
    ['Online Transactions',       onlineTransactions,            'FF2563EB'],
    ['Free Products Value',       freeTotalVal,                  'FFF59E0B'],
    ['Expenses + Breakage',       expTotal + breakTotal,         'FFC8102E'],
    ['Closing Stock Value',       closingStock,                  'FF111111'],
  ];

  summaryItems.forEach(([label, value, argb]) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    row.getCell(2).font = { bold: true, size: 13, color: { argb: argb === 'FF111111' ? 'FF111111' : argb } };
    row.getCell(2).numFmt = '₹#,##0.00';
    row.getCell(2).alignment = { horizontal: 'right' };
    row.height = 22;
  });
};

// ─── DASHBOARD ───────────────────────────────────────────
router.get('/dashboard', auth, async (req, res) => {
  const gid = req.user.godown_id;
  const { range } = req.query;

  let dateFilter;
  if (range === '7days') dateFilter = `CURRENT_DATE - INTERVAL '7 days'`;
  else if (range === '30days') dateFilter = `CURRENT_DATE - INTERVAL '30 days'`;
  else if (range === 'all') dateFilter = `'1900-01-01'`;
  else dateFilter = `CURRENT_DATE`;

  const gFilter = gid ? `WHERE godown_id = '${gid}'` : '';
  const gAnd = gid ? `AND godown_id = '${gid}'` : '';
  const gBillsAnd = gid ? `AND b.godown_id = '${gid}'` : '';
  const gCsAnd = gid ? `AND cs.godown_id = '${gid}'` : '';
  const gPuAnd = gid ? `AND p.godown_id = '${gid}'` : '';

  try {
    const [
      stockVal, shopSales, counterSales, totalExpenses,
      pendingBills, pendingPurchases, purchases, cashFlow, freeProductsVal
    ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM((i.quantity_cases * p.selling_price) + (i.quantity_units * p.selling_price_per_unit)), 0) as total FROM inventory i JOIN products p ON i.product_id = p.id ${gid ? `WHERE i.godown_id = '${gid}'` : ''}`),
      pool.query(`SELECT COALESCE(SUM(b.total_amount), 0) as total FROM bills b WHERE DATE(b.created_at) >= ${dateFilter} ${gBillsAnd}`),
      pool.query(`SELECT COALESCE(SUM(cs.total_amount), 0) as total FROM counter_sales cs WHERE DATE(cs.created_at) >= ${dateFilter} ${gCsAnd}`),
      pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE DATE(created_at) >= ${dateFilter} ${gAnd}`),
      pool.query(`SELECT COALESCE(SUM(pending_amount), 0) as total FROM bills WHERE status != 'CLEARED' ${gAnd}`),
      pool.query(`SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as total FROM purchases WHERE payment_status != 'PAID' ${gAnd}`),
      pool.query(`SELECT COALESCE(SUM(p.total_amount), 0) as total FROM purchases p WHERE DATE(p.purchase_date) >= ${dateFilter} ${gPuAnd}`),
      gid ? pool.query(`SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END), 0) as total_deposits, COALESCE(SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END), 0) as total_withdrawals FROM bank_transactions WHERE godown_id = $1`, [gid])
          : pool.query(`SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END), 0) as total_deposits, COALESCE(SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END), 0) as total_withdrawals FROM bank_transactions`),
      pool.query(`SELECT COALESCE(SUM(fp.quantity_units * p.selling_price_per_unit), 0) as total FROM free_products fp JOIN products p ON fp.product_id = p.id WHERE DATE(fp.created_at) >= ${dateFilter} ${gid ? `AND fp.godown_id = '${gid}'` : ''}`)
    ]);

    const billsPaidRes = await pool.query(`SELECT COALESCE(SUM(paid_amount), 0) as total FROM bills WHERE 1=1 ${gAnd}`);
    const allTimeCounterRes = await pool.query(`SELECT COALESCE(SUM(total_amount),0) as total FROM counter_sales WHERE 1=1 ${gAnd}`);

    const totalDeposits = parseFloat(cashFlow.rows[0].total_deposits);
    const totalWithdrawals = parseFloat(cashFlow.rows[0].total_withdrawals);
    const allTimeCounter = parseFloat(allTimeCounterRes.rows[0].total);
    const billsPaid = parseFloat(billsPaidRes.rows[0].total);
    const cashInHand = (allTimeCounter + billsPaid) - totalDeposits + totalWithdrawals;
    const cashInBank = totalDeposits - totalWithdrawals;
    const counterTotal = parseFloat(counterSales.rows[0].total);
    const shopTotal = parseFloat(shopSales.rows[0].total);

    res.json({
      stock_value: stockVal.rows[0].total,
      total_sales: shopTotal + counterTotal,
      shop_sales: shopSales.rows[0].total,
      counter_sales: counterSales.rows[0].total,
      purchases: purchases.rows[0].total,
      total_expenses: totalExpenses.rows[0].total,
      pending_bills: pendingBills.rows[0].total,
      pending_purchases: pendingPurchases.rows[0].total,
      free_products_value: freeProductsVal.rows[0].total,
      cash_in_hand: cashInHand,
      cash_in_bank: cashInBank
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sales', auth, async (req, res) => {
  const { from, to } = req.query;
  const gid = req.user.godown_id;
  const params = [from, to];
  let query = `
    SELECT b.*, s.name as shop_name, g.name as godown_name
    FROM bills b JOIN shops s ON b.shop_id=s.id JOIN godowns g ON b.godown_id=g.id
    WHERE DATE(b.created_at) BETWEEN $1 AND $2
  `;
  if (gid) { query += ` AND b.godown_id=$3`; params.push(gid); }
  query += ` ORDER BY b.created_at DESC`;
  const result = await pool.query(query, params);
  res.json(result.rows);
});

// ─── DOWNLOAD ────────────────────────────────────────────
router.get('/download/:type', auth, async (req, res) => {
  const { from, to } = req.query;
  const { type } = req.params;
  const gid = req.user.godown_id;

  const billsAnd = gid ? `AND b.godown_id='${gid}'` : '';
  const csAnd = gid ? `AND cs.godown_id='${gid}'` : '';
  const puAnd = gid ? `AND pu.godown_id='${gid}'` : '';
  const expAnd = gid ? `AND godown_id='${gid}'` : '';

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Inventory System';
    workbook.created = new Date();

    let bills = [], counterSales = [], purchases = [], expenses = [], freeProducts = [], breakages = [];

    if (['bills', 'complete', 'delivery', 'daily'].includes(type)) {
      const q = `SELECT b.*, s.name as shop_name, g.name as godown_name FROM bills b JOIN shops s ON b.shop_id=s.id JOIN godowns g ON b.godown_id=g.id WHERE DATE(b.created_at) BETWEEN '${from}' AND '${to}' ${billsAnd} ORDER BY b.created_at DESC`;
      bills = (await pool.query(q)).rows;
    }

    if (['counter', 'complete'].includes(type)) {
      const q = `SELECT cs.created_at, cs.payment_mode, cs.sale_number,
        p.name as product_name, p.bottles_per_case, p.selling_price_per_unit,
        csi.quantity_units, csi.price_per_unit, csi.total_amount
        FROM counter_sales cs
        JOIN counter_sale_items csi ON csi.counter_sale_id = cs.id
        JOIN products p ON csi.product_id = p.id
        WHERE DATE(cs.created_at) BETWEEN '${from}' AND '${to}' ${csAnd}
        ORDER BY cs.created_at DESC`;
      counterSales = (await pool.query(q)).rows;
    }

    if (['purchases', 'full'].includes(type)) {
      const q = `SELECT pu.*, c.name as company_name, g.name as godown_name FROM purchases pu JOIN companies c ON pu.company_id=c.id JOIN godowns g ON pu.godown_id=g.id WHERE DATE(pu.purchase_date) BETWEEN '${from}' AND '${to}' ${puAnd} ORDER BY pu.purchase_date DESC`;
      purchases = (await pool.query(q)).rows;
    }

    if (['expenses', 'full'].includes(type)) {
      expenses = (await pool.query(`SELECT * FROM expenses WHERE DATE(created_at) BETWEEN '${from}' AND '${to}' ${expAnd} ORDER BY created_at DESC`)).rows;
      freeProducts = (await pool.query(`SELECT fp.*, p.name as product_name, p.selling_price_per_unit FROM free_products fp JOIN products p ON fp.product_id=p.id WHERE DATE(fp.created_at) BETWEEN '${from}' AND '${to}' ${expAnd} ORDER BY fp.created_at DESC`)).rows;
      breakages = (await pool.query(`SELECT br.*, p.name as product_name FROM breakage br JOIN products p ON br.product_id=p.id WHERE DATE(br.breakage_date) BETWEEN '${from}' AND '${to}' ${expAnd} ORDER BY br.breakage_date DESC`)).rows;
    }

    if (type === 'bills') {
      await addBillsSheet(workbook.addWorksheet('Shop Sales'), bills, pool);
    }

    if (type === 'counter') {
      await addCounterSheet(workbook.addWorksheet('Counter Sales'), counterSales);
    }

    if (type === 'complete') {
      await addBillsSheet(workbook.addWorksheet('Shop Sales'), bills, pool);
      await addCounterSheet(workbook.addWorksheet('Counter Sales'), counterSales);
      const s3 = workbook.addWorksheet('Summary');
      s3.columns = [{ width: 30 }, { width: 20 }];
      sectionHeader(s3, 'COMPLETE SALES SUMMARY', 2);
      const shopTotal = bills.reduce((s, b) => s + parseFloat(b.total_amount), 0);
      const counterTotal = counterSales.reduce((s, c) => s + parseFloat(c.total_amount), 0);
      [['Shop Sales Total', shopTotal], ['Counter Sales Total', counterTotal], ['GRAND TOTAL', shopTotal + counterTotal]].forEach((r, i) => {
        const row = s3.addRow(r);
        row.getCell(2).numFmt = '₹#,##0.00';
        if (i === 2) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }; });
        else row.getCell(1).font = { bold: true };
        row.height = 20;
      });
    }

    if (type === 'purchases') {
      await addPurchasesSheet(workbook.addWorksheet('Purchases'), purchases, pool);
    }

    if (type === 'expenses') {
      await addExpensesSheet(workbook.addWorksheet('Expenses'), expenses, freeProducts, breakages);
    }

    if (type === 'full') {
      await addPurchasesSheet(workbook.addWorksheet('Purchases'), purchases, pool);
      await addExpensesSheet(workbook.addWorksheet('Expenses'), expenses, freeProducts, breakages);
      const s3 = workbook.addWorksheet('Summary');
      s3.columns = [{ width: 30 }, { width: 20 }];
      sectionHeader(s3, 'PURCHASE + EXPENSE SUMMARY', 2);
      const purchaseTotal = purchases.reduce((s, p) => s + parseFloat(p.total_amount), 0);
      const expTotal = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
      const freeTotal = freeProducts.reduce((s, f) => s + (parseFloat(f.quantity_units || 0) * parseFloat(f.selling_price_per_unit || 0)), 0);
      const breakTotal = breakages.reduce((s, b) => s + parseFloat(b.total_penalty), 0);
      [['Purchases Total', purchaseTotal], ['Regular Expenses', expTotal], ['Free Products (Value)', freeTotal], ['Breakage Penalties', breakTotal], ['TOTAL OUTFLOW', purchaseTotal + expTotal + freeTotal + breakTotal]].forEach((r, i) => {
        const row = s3.addRow(r);
        row.getCell(2).numFmt = '₹#,##0.00';
        if (i === 4) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }; });
        else row.getCell(1).font = { bold: true };
        row.height = 20;
      });
    }

    if (type === 'delivery') {
      const sheet = workbook.addWorksheet('Delivery Report');
      await addDeliverySheet(sheet, from, to, gid, pool);
    }

    if (type === 'daily') {
      const sheet = workbook.addWorksheet('Daily Summary');
      await addDailySummarySheet(sheet, from, gid, pool);
    }

    const typeNames = {
      bills: 'Shop_Sales', counter: 'Counter_Sales', complete: 'Complete_Sales',
      purchases: 'Purchases', expenses: 'Expenses', full: 'Purchase_Expenses',
      delivery: 'Delivery_Report', daily: 'Daily_Summary'
    };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${typeNames[type]}_${from}_${to}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;