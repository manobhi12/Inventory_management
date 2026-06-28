/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

function SearchableSelect({ options, value, onChange, placeholder = "Search...", required = false }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);
  const filtered = query.trim() === "" ? options : options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (opt) => { onChange(opt.value); setQuery(""); setOpen(false); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input className="input" style={{ marginTop: "6px", width: "100%", boxSizing: "border-box" }}
        value={open ? query : (selected ? selected.label : "")}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={() => { setQuery(""); setOpen(true); }}
        placeholder={placeholder} autoComplete="off" />
      {required && <input tabIndex={-1} style={{ opacity: 0, height: 0, position: "absolute", pointerEvents: "none" }} value={value || ""} onChange={() => {}} required />}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#fff", border: "2px solid #e5e7eb", borderRadius: "4px", zIndex: 9999, maxHeight: "220px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: "13px", color: "#aaa", fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase" }}>No results{query ? ` for "${query}"` : ""}</div>
          ) : filtered.map((opt, i) => {
            const isSelected = opt.value === value;
            const lq = query.trim().toLowerCase();
            const label = opt.label;
            let display = label;
            if (lq && label.toLowerCase().includes(lq)) {
              const idx = label.toLowerCase().indexOf(lq);
              display = (<>{label.slice(0, idx)}<strong style={{ color: "#C8102E" }}>{label.slice(idx, idx + lq.length)}</strong>{label.slice(idx + lq.length)}</>);
            }
            return (
              <div key={i} onMouseDown={() => handleSelect(opt)}
                style={{ padding: "10px 16px", fontSize: "14px", cursor: "pointer", background: isSelected ? "#fff8f8" : "transparent", borderLeft: isSelected ? "3px solid #C8102E" : "3px solid transparent", borderBottom: "1px solid #f3f4f6", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                onMouseLeave={e => e.currentTarget.style.background = isSelected ? "#fff8f8" : "transparent"}
              >{display}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const emptyItem = { product_id: "", quantity_cases: 0, quantity_units: 0, price_per_case: 0, price_per_unit: 0, bottles_per_case: 24, total_price: 0 };
const emptyFreeItem = { product_id: "", quantity_units: "" };

const labelStyle = { fontSize: "13px", color: "#111", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 };
const actionBtn = (color) => ({ color, fontSize: "15px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" });
const modeBtn = (active, color) => ({ flex: 1, padding: "8px", border: `2px solid ${active ? color : "#e5e7eb"}`, background: active ? color : "transparent", color: active ? "#fff" : "#888", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: "3px" });

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [shops, setShops] = useState([]);
  const [products, setProducts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(null); // holds full bill object
  const [editItems, setEditItems] = useState([]);
  const [editPaid, setEditPaid] = useState("");
  const [editDriverId, setEditDriverId] = useState("");
  const [editDeliveryDate, setEditDeliveryDate] = useState("");
  const [editSessionLoading, setEditSessionLoading] = useState(false);
  const [editPaymentMode, setEditPaymentMode] = useState("CASH");
  const [editOnlineAmount, setEditOnlineAmount] = useState("");
  const [editPaidCash, setEditPaidCash] = useState("");
  const [error, setError] = useState("");
  const [selectedBills, setSelectedBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stockCache, setStockCache] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const { user } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Expanded rows state: { billId: items[] | "loading" }
  const [expandedItems, setExpandedItems] = useState({});

  const makeToday = () => new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    shop_id: "", driver_id: "", delivery_date: makeToday(), paid_amount: "",
    payment_mode: "CASH", online_amount: "",
    items: [{ ...emptyItem }],
    freeItems: []
  });

  const load = async (shop = shopSearch) => {
    const params = new URLSearchParams();
    if (shop) params.append("shop", shop);
    const res = await api.get(`/bills${params.toString() ? "?" + params.toString() : ""}`);
    let filtered = Array.isArray(res.data) ? res.data : [];
    if (startDate) { const start = new Date(startDate).setHours(0,0,0,0); filtered = filtered.filter(b => new Date(b.created_at).getTime() >= start); }
    if (endDate) { const end = new Date(endDate).setHours(23,59,59,999); filtered = filtered.filter(b => new Date(b.created_at).getTime() <= end); }
    setBills(filtered);
  };

  useEffect(() => {
    const init = async () => {
      await load();
      const [shopsRes, productsRes, driversRes, inventoryRes] = await Promise.all([
        api.get("/shops"), api.get("/products"), api.get("/drivers"), api.get("/inventory")
      ]);
      setShops(Array.isArray(shopsRes.data) ? shopsRes.data : []);
      setProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
      setDrivers(Array.isArray(driversRes.data) ? driversRes.data : []);
      setInventory(Array.isArray(inventoryRes.data) ? inventoryRes.data : []);
    };
    init();
  }, []);

  const toggleExpand = async (billId) => {
    if (expandedItems[billId]) {
      // collapse
      setExpandedItems(prev => { const n = { ...prev }; delete n[billId]; return n; });
      return;
    }
    setExpandedItems(prev => ({ ...prev, [billId]: "loading" }));
    try {
      const res = await api.get(`/bills/${billId}/items`);
      setExpandedItems(prev => ({ ...prev, [billId]: Array.isArray(res.data) ? res.data : [] }));
    } catch {
      setExpandedItems(prev => { const n = { ...prev }; delete n[billId]; return n; });
    }
  };

  const getStock = (productId) => {
    const rows = inventory.filter(inv => String(inv.product_id) === String(productId));
    if (!rows.length) return null;
    const totalCases = rows.reduce((s, r) => s + (parseInt(r.quantity_cases) || 0), 0);
    const totalUnits = rows.reduce((s, r) => s + (parseInt(r.quantity_units) || 0), 0);
    const parts = [];
    if (totalCases > 0) parts.push(`${totalCases}C`);
    if (totalUnits > 0) parts.push(`${totalUnits}B`);
    return parts.length ? parts.join(" ") : "0C";
  };

  const applyFilter = () => load();
  const clearFilter = () => { setStartDate(""); setEndDate(""); load(); };
  const handleShopSearch = (val) => { setShopSearch(val); load(val); };
  const clearShopSearch = () => { setShopSearch(""); setSearchInput(""); handleShopSearch(""); };
  const toggleSelect = (id) => setSelectedBills(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedBills(selectedBills.length === bills.length ? [] : bills.map(b => b.id));

  const printLoadSheet = async () => {
    if (!selectedBills.length) return;
    const allItems = (await Promise.all(selectedBills.map(id => api.get(`/bills/${id}/items`).then(r => r.data)))).flat();
    const productMap = {};
    allItems.forEach(item => {
      if (!productMap[item.product_name]) productMap[item.product_name] = { cases: 0, bottles: 0, bpc: item.bottles_per_case || 24, pricePerCase: parseFloat(item.price_per_case || 0), pricePerUnit: parseFloat(item.price_per_unit || 0) };
      productMap[item.product_name].cases += parseInt(item.quantity_cases || 0);
      productMap[item.product_name].bottles += parseInt(item.quantity_units || 0);
    });
    Object.keys(productMap).forEach(name => { const p = productMap[name]; const total = (p.cases * p.bpc) + p.bottles; p.totalCases = Math.floor(total / p.bpc); p.extraBottles = total % p.bpc; });
    const driverNames = [...new Set(selectedBills.map(id => {
      const b = bills.find(b => b.id === id);
      return b?.driver_name || null;
    }).filter(Boolean))].join(", ");
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Load Sheet</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Courier New',monospace;font-size:14px;padding:20px;max-width:320px;margin:auto;}.title{font-size:20px;font-weight:bold;text-align:center;margin-bottom:4px;}.center{text-align:center;font-size:12px;color:#555;margin-bottom:8px;}.driver{text-align:center;font-size:15px;font-weight:bold;margin-bottom:4px;}.line{border-top:2px dashed #000;margin:10px 0;}table{width:100%;border-collapse:collapse;}th{text-align:left;border-bottom:2px solid #000;padding:5px 4px;font-size:12px;text-transform:uppercase;}td{padding:8px 4px;border-bottom:1px dotted #ccc;font-size:14px;}.qty{text-align:center;font-size:16px;font-weight:bold;}@media print{body{padding:5px;}}</style></head><body><div class="title">LOAD SHEET</div><div class="center">${new Date().toLocaleDateString('en-IN')} | ${selectedBills.length} bills</div><div class="center">${bills.find(b => b.id === selectedBills[0])?.route_name || ""}</div> ${driverNames ? `<div class="driver">Driver: ${driverNames}</div>` : ''}<div class="line"></div><table><thead><tr><th>Product</th><th style="text-align:center">Cases</th><th style="text-align:center">Bottles</th><th style="text-align:right">Value</th></tr></thead><tbody>${Object.entries(productMap).map(([name, qty]) => { const value = (qty.totalCases * qty.pricePerCase) + (qty.extraBottles * qty.pricePerUnit); return `<tr><td style="font-weight:bold">${name}</td><td class="qty">${qty.totalCases}</td><td class="qty">${qty.extraBottles}</td><td style="text-align:right;font-weight:bold">₹${value.toLocaleString()}</td></tr>`; }).join('')}</tbody></table><div class="line"></div><div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold;padding:4px 0;"><span>TOTAL CASES</span><span>${Object.values(productMap).reduce((s, qty) => s + qty.totalCases, 0)}</span></div><div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold;padding:4px 0;"><span>TOTAL VALUE</span><span>₹${Object.values(productMap).reduce((s, qty) => s + (qty.totalCases * qty.pricePerCase) + (qty.extraBottles * qty.pricePerUnit), 0).toLocaleString()}</span></div><div class="line"></div><div class="center">Total Bills: ${selectedBills.length}</div></body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  const updateItem = (i, field, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: val };
    if (field === "product_id") {
      const p = products.find(p => p.id === val);
      if (p) { items[i].price_per_case = parseFloat(p.selling_price) || 0; items[i].price_per_unit = parseFloat(p.selling_price_per_unit) || 0; items[i].bottles_per_case = parseInt(p.bottles_per_case) || 24; }
      else { items[i].price_per_case = 0; items[i].price_per_unit = 0; items[i].bottles_per_case = 24; }
    }
    if (val) {
      api.get(`/bills/stock/${val}`).then(res => {
        if (res.data) {
          const { quantity_cases, quantity_units, bottles_per_case } = res.data;
          const bpc = parseInt(bottles_per_case) || 24;
          const cases = parseInt(quantity_cases) || 0;
          const units = parseInt(quantity_units) || 0;
          const parts = [];
          if (cases > 0) parts.push(`${cases}C`);
          if (units > 0) parts.push(`${units}B`);
          setStockCache(prev => ({ ...prev, [val]: parts.join(" ") }));
        } else {
          setStockCache(prev => ({ ...prev, [val]: "0C" }));
        }
      }).catch(() => {});
    }
    items[i].total_price = (parseFloat(items[i].quantity_cases || 0) * parseFloat(items[i].price_per_case || 0)) + (parseFloat(items[i].quantity_units || 0) * parseFloat(items[i].price_per_unit || 0));
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  const grandTotal = form.items.reduce((s, i) => s + parseFloat(i.total_price || 0), 0);

  const updateFreeItem = (i, field, val) => {
    const freeItems = [...form.freeItems];
    freeItems[i] = { ...freeItems[i], [field]: val };
    setForm({ ...form, freeItems });
  };
  const addFreeItem = () => setForm({ ...form, freeItems: [...form.freeItems, { ...emptyFreeItem }] });
  const removeFreeItem = (i) => setForm({ ...form, freeItems: form.freeItems.filter((_, idx) => idx !== i) });

  const shopOptions = shops.map(s => ({ value: s.id, label: s.owner_name ? `${s.name} — ${s.owner_name}` : s.name }));
  const productOptions = products.map(p => ({ value: p.id, label: p.name }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!form.shop_id) { setError("Please select a shop"); return; }
    if (!form.driver_id) { setError("Please select a driver"); return; }
    for (const item of form.items) {
      if (!item.product_id) { setError("Please select a product for all items"); return; }
      if (!parseFloat(item.quantity_cases || 0) && !parseFloat(item.quantity_units || 0)) { setError("Please enter quantity for all items"); return; }
    }
   setLoading(true);
  try {
      // Create bill and capture bill_id
      const billRes = await api.post("/bills", {
        shop_id: form.shop_id, driver_id: form.driver_id, delivery_date: form.delivery_date,
        paid_amount: form.paid_amount || 0,
        payment_mode: form.payment_mode,
        online_amount: form.payment_mode === 'SPLIT' ? parseFloat(form.online_amount || 0) : undefined,
        items: form.items.map(item => ({
          product_id: item.product_id, quantity_cases: parseInt(item.quantity_cases || 0),
          quantity_units: parseInt(item.quantity_units || 0), bottles_per_case: parseInt(item.bottles_per_case || 24),
          price_per_case: parseFloat(item.price_per_case || 0), price_per_unit: parseFloat(item.price_per_unit || 0),
          total_price: parseFloat(item.total_price || 0)
        }))
      });
    
      const billId = billRes.data.id;  // ✅ Capture bill ID
    
      // Link free products with bill_id
      for (const fi of form.freeItems) {
        if (!fi.product_id || !fi.quantity_units) continue;
        await api.post("/free-products", { 
          product_id: fi.product_id, 
          quantity_units: parseInt(fi.quantity_units), 
          shop_id: form.shop_id, 
          given_date: form.delivery_date, 
          notes: "Given with bill", 
          sale_type: "DELIVERY",
          bill_id: billId  // ✅ ADD THIS
       });
     }
    
     setModal(false);
     setForm({ shop_id: "", driver_id: "", delivery_date: makeToday(), paid_amount: "", payment_mode: "CASH", online_amount: "", paid_amount_cash: "", items: [{ ...emptyItem }], freeItems: [] });
     load();
   } catch (err) {
     setError(err.response?.data?.error || "Failed to generate bill");
   } finally {
     setLoading(false);
   }
  };

  const openEditSession = async (b) => {
    setEditSessionLoading(true);
    try {
      const res = await api.get(`/bills/${b.id}/items`);
      setEditItems(res.data.map(item => ({
        product_id: item.product_id,
        quantity_cases: item.quantity_cases.toString(),
        quantity_units: item.quantity_units.toString(),
        bottles_per_case: item.bottles_per_case || 24,
        price_per_case: item.price_per_case.toString(),
        price_per_unit: item.price_per_unit.toString(),
        total_price: item.total_price.toString()
      })));
      setEditPaid(b.paid_amount || "");
      setEditDriverId(b.driver_id || "");
      setEditDeliveryDate(b.delivery_date ? b.delivery_date.split("T")[0] : "");
      setEditPaymentMode(b.payment_mode || "CASH");
      setEditOnlineAmount(b.online_amount && parseFloat(b.online_amount) > 0 ? b.online_amount.toString() : "");
      setEditPaidCash(
        b.payment_mode === "SPLIT" && b.paid_amount && b.online_amount
        ? (parseFloat(b.paid_amount) - parseFloat(b.online_amount)).toString()
        : ""
      );
      setEditModal(b);
    } catch {
      alert("Failed to load bill items");
    } finally {
      setEditSessionLoading(false);
    }
  };

  const updateEditItem = (i, field, val) => {
    setEditItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const next = { ...item, [field]: val };
      if (field === "product_id") {
        const p = products.find(p => p.id === val);
        if (p) {
          next.price_per_case = parseFloat(p.selling_price || 0).toString();
          next.price_per_unit = parseFloat(p.selling_price_per_unit || 0).toString();
          next.bottles_per_case = parseInt(p.bottles_per_case || 24);
        }
      }
      const cases = parseInt(field === "quantity_cases" ? val : next.quantity_cases || 0);
      const units = parseInt(field === "quantity_units" ? val : next.quantity_units || 0);
      const bpc = parseInt(next.bottles_per_case || 24);
      const ppc = parseFloat(field === "price_per_case" ? val : next.price_per_case || 0);
      const ppu = parseFloat(field === "price_per_unit" ? val : next.price_per_unit || 0);
      next.total_price = ((cases * ppc) + (units * ppu)).toString();
      return next;
    }));
  };

  const handleEditSession = async (e) => {
    e.preventDefault();
    if (editLoading) return;
    setEditLoading(true);
    try {
      await api.put(`/bills/${editModal.id}`, {
        items: editItems.map(item => ({
          product_id: item.product_id,
          quantity_cases: parseInt(item.quantity_cases || 0),
          quantity_units: parseInt(item.quantity_units || 0),
          bottles_per_case: parseInt(item.bottles_per_case || 24),
          price_per_case: parseFloat(item.price_per_case || 0),
          price_per_unit: parseFloat(item.price_per_unit || 0),
          total_price: parseFloat(item.total_price || 0)
        })),
        paid_amount: parseFloat(editPaid || 0),
        driver_id: editDriverId || null,
        delivery_date: editDeliveryDate || null,
        payment_mode: editPaymentMode,
        online_amount: editPaymentMode === 'SPLIT' ? parseFloat(editOnlineAmount || 0) : undefined
      });
      setEditModal(null); setEditItems([]); setEditPaid(""); setEditDriverId(""); setEditDeliveryDate(""); setEditPaymentMode("CASH"); setEditOnlineAmount(""); setEditPaidCash("");
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update bill");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this bill? Inventory will be restored.")) return;
    try { await api.delete(`/bills/${id}`); setSelectedBills(prev => prev.filter(b => b !== id)); load(); }
    catch (err) { alert(err.response?.data?.error || "Failed to delete bill"); }
  };

  const printBill = async (bill) => {
    const items = (await api.get(`/bills/${bill.id}/items`)).data;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Bill #${bill.bill_number}</title>
      <style>
        /* receipt-sized box + clean readable fonts + tabular numbers */
        @media print { body{margin:0;padding:8px;} }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          font-size:12px;
          color:#111;
          padding:20px;
          max-width:300px;    /* keep receipt width */
          width:300px;        /* explicit width for print */
          margin:auto;
          box-sizing:border-box;
        }
        .title { font-size:16px; font-weight:800; text-align:center; margin-bottom:4px; }
        .shop-name { font-size:14px; font-weight:700; text-align:center; margin-bottom:6px; color:#111; }
        .center { text-align:center; font-size:11px; color:#111; margin-bottom:8px; }
        .line { border-top:1px dashed #000; margin:8px 0; }
        .row{display:flex;justify-content:space-between;margin:4px 0;line-height:1;font-weight:700;}
        table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;}
        th{text-align:left;font-size:11px;border-bottom:1px solid #000;padding:3px 0;text-transform:uppercase;color:#111;}
        td{padding:3px 0;font-size:12px;color:#111;}
        .total-row{font-weight:700;font-size:13px;}
        /* numeric font: tabular numbers for consistent alignment */
        .num { font-family: "Roboto Mono", "Courier New", monospace; font-variant-numeric: tabular-nums; }
        .right { text-align:right; }
        @media print{ .title{font-size:15px;} body{max-width:300px;width:300px;} }
      </style>
    </head><body>
      <div class="title">SHOP BILL</div>
      <div class="shop-name">${bill.shop_name}</div>
      ${bill.shop_phone ? `<div class="center" style="font-size:12px;font-weight:600;">${bill.shop_phone}</div>` : ''}
      <div class="center small"><span>Route: </span><span>${bill.route_name || bill.godown_name}</span></div>
      <div class="line"></div>
      <div class="row"><strong>Bill No.:</strong><strong class="num">${bill.bill_code || '#' + bill.bill_number}</strong></div>
      <div class="row"><strong>Date:</strong><strong class="num">${new Date(bill.created_at).toLocaleDateString('en-IN')}</strong></div>
      <div class="row"><strong>Shop:</strong><strong class="num">${bill.shop_name}</strong></div>
      ${bill.driver_name ? `<div class="row"><strong>Driver:</strong><strong class="num">${bill.driver_name}</strong></div>` : ''}
      ${bill.delivery_date ? `<div class="row"><strong>Delivery:</strong><strong class="num">${new Date(bill.delivery_date).toLocaleDateString('en-IN')}</strong></div>` : ''}
      <div class="line"></div>
      <table><thead><tr>
        <th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th>
      </tr></thead><tbody>
      ${items.map(item => {
        const qty = `${item.quantity_cases > 0 ? item.quantity_cases + 'C' : ''}${item.quantity_units > 0 ? ' ' + item.quantity_units + 'B' : ''}`;
        const rate = item.quantity_cases > 0 ? item.price_per_case : item.price_per_unit;
        return `<tr>
          <td style="font-weight:600">${item.product_name}</td>
          <td style="text-align:center">${qty || '—'}</td>
          <td class="right num">₹${Number(rate).toLocaleString()}</td>
          <td class="right num">₹${Number(item.total_price).toLocaleString()}</td>
        </tr>`;
      }).join('')}
      </tbody></table>
      <div class="line"></div>
      <div class="row total-row"><span>TOTAL</span><span class="num">₹${Number(bill.total_amount).toLocaleString()}</span></div>
      <div class="row" style="font-size:13px;color:#111;font-weight:600;"><span>Total Cases</span><span class="num">${items.reduce((s, i) => s + parseInt(i.quantity_cases || 0), 0)} cases</span></div>
      <div class="row"><span>Paid</span><span class="num">₹${Number(bill.paid_amount || 0).toLocaleString()}</span></div>
      <div class="row bold"><span>Pending</span><span class="num">₹${Number(bill.pending_amount || 0).toLocaleString()}</span></div>
      <div class="line"></div>
      <br/><br/><div class="center small" style="margin-top:12px;">Thank you!</div>
    </body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Bills</h1>
          {selectedBills.length > 0 && <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>{selectedBills.length} bill{selectedBills.length > 1 ? "s" : ""} selected for load sheet</p>}
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {selectedBills.length > 0 && <button onClick={printLoadSheet} className="btn-secondary">Print Load Sheet ({selectedBills.length})</button>}
          {user?.role !== "admin" && (
            <button className="btn-primary" onClick={() => {
              setForm({ shop_id: "", driver_id: "", delivery_date: makeToday(), paid_amount: "", payment_mode: "CASH", online_amount: "", paid_amount_cash: "", items: [{ ...emptyItem }], freeItems: [] });
              setError(""); setModal(true);
            }}>+ New Bill</button>
          )}
        </div>
      </div>

      {/* Shop Search */}
      <div style={{ marginBottom: "16px", display: "flex", gap: "12px", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}>
            Search by Shop Name
          </label>
          <input
            className="input"
            style={{ marginTop: "6px", width: "100%", boxSizing: "border-box" }}
            placeholder="Search shop name..."
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); handleShopSearch(e.target.value); }}
          />
        </div>
        <button className="btn-primary" onClick={() => handleShopSearch(searchInput)}>Search</button>
        {shopSearch && <button className="btn-outline" onClick={clearShopSearch}>Clear</button>}
      </div>
      {shopSearch && (
        <div style={{ marginBottom: "16px", background: "#fff8f8", borderLeft: "4px solid #C8102E", padding: "10px 16px", fontSize: "13px", fontFamily: "'Barlow Condensed', sans-serif", color: "#C8102E", fontWeight: 700, letterSpacing: "0.04em" }}>
          Showing all bills for shops matching "{shopSearch}" — {bills.length} found
        </div>
      )}
      {!shopSearch && (
        <div style={{ marginBottom: "16px", fontSize: "13px", color: "#aaa", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
          Showing latest 50 bills — search a shop name to see all its bills
        </div>
      )}

      {/* Date Filter */}
      <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "24px", borderRadius: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: "11px", color: "#888", textTransform: "uppercase" }}>Start Date</label>
            <input type="date" className="input" style={{ marginTop: "6px" }} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "11px", color: "#888", textTransform: "uppercase" }}>End Date</label>
            <input type="date" className="input" style={{ marginTop: "6px" }} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-primary" onClick={applyFilter} style={{ marginTop: "20px" }}>Apply Filter</button>
            <button className="btn-outline" onClick={clearFilter} style={{ marginTop: "20px" }}>Clear</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              <th style={{ width: "40px", textAlign: "center" }}>
                <input type="checkbox" checked={selectedBills.length === bills.length && bills.length > 0} onChange={toggleSelectAll} style={{ accentColor: "#C8102E" }} />
              </th>
              {[
                { label: "Bill #", width: "110px" },
                { label: "Date", width: "90px" },
                { label: "Shop", width: "" },
                { label: "Godown", width: "100px" },
                { label: "Driver", width: "80px" },
                { label: "Delivery", width: "90px" },
                { label: "Total", width: "130px" },
                { label: "Paid", width: "80px" },
                { label: "Actions", width: "160px" },
              ].map(h => <th key={h.label} style={{ width: h.width || undefined }}>{h.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {bills.map(b => {
              const isExpanded = !!expandedItems[b.id];
              const isLoading = expandedItems[b.id] === "loading";
              const items = isExpanded && !isLoading ? expandedItems[b.id] : [];

              return (
                <React.Fragment key={b.id}>
                  <tr className="table-row" style={{ background: selectedBills.includes(b.id) ? "#fff8f8" : "" }}>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={selectedBills.includes(b.id)} onChange={() => toggleSelect(b.id)} style={{ accentColor: "#C8102E" }} />
                    </td>
                    <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "#C8102E", whiteSpace: "nowrap" }}>{b.bill_code || `#${b.bill_number}`}</td>
                    <td style={{ color: "#555", fontSize: "15px" }}>{new Date(b.created_at).toLocaleDateString("en-IN")}</td>
                    <td style={{ fontWeight: 600, fontSize: "16px" }}>{b.shop_name}</td>
                    <td style={{ color: "#888", fontSize: "13px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.godown_name}</td>
                    <td style={{ fontSize: "15px" }}>{b.driver_name || <span style={{ color: "#ccc" }}>—</span>}</td>
                    <td style={{ fontSize: "15px", color: "#555" }}>{b.delivery_date ? new Date(b.delivery_date).toLocaleDateString("en-IN") : <span style={{ color: "#ccc" }}>—</span>}</td>

                    {/* Total — with expand toggle */}
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div>
                          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "20px" }}>
                            ₹{Number(b.total_amount).toLocaleString()}
                          </span>
                          {b.total_cases > 0 && (
                            <div style={{ fontSize: "11px", color: "#888", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, marginTop: "2px" }}>
                              {b.total_cases} cases
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleExpand(b.id)}
                          style={{
                            background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
                            fontSize: "11px", color: "#888", fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                            borderRadius: "3px", lineHeight: 1
                          }}
                          title={isExpanded ? "Hide items" : "View items"}
                        >
                          {isLoading ? "..." : isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </td>

                    <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "#16a34a" }}>₹{Number(b.paid_amount || 0).toLocaleString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "16px" }}>
                        <button onClick={() => printBill(b)} style={actionBtn("#2563eb")}>Print</button>
                        <button onClick={() => openEditSession(b)} style={actionBtn("#C8102E")} disabled={editSessionLoading}>Edit</button>
                        <button onClick={() => handleDelete(b.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded items row */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} style={{ padding: "0 16px 16px 56px", background: "#f9fafb", borderBottom: "2px solid #f0f0f0" }}>
                        {isLoading ? (
                          <p style={{ padding: "12px 0", color: "#aaa", fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", fontSize: "13px" }}>Loading...</p>
                        ) : (
                          <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse", marginTop: "12px" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                                {["Product", "Cases", "Bottles", "Rate/Case", "Rate/Bottle", "Amount"].map(h => (
                                  <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#888", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map(item => (
                                <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111" }}>{item.product_name}</td>
                                  <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700 }}>
                                    {parseInt(item.quantity_cases || 0) > 0 ? parseInt(item.quantity_cases) : "—"}
                                  </td>
                                  <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700 }}>
                                    {parseInt(item.quantity_units || 0) > 0 ? parseInt(item.quantity_units) : "—"}
                                  </td>
                                  <td style={{ padding: "10px 12px", color: "#555" }}>₹{Number(item.price_per_case).toLocaleString()}</td>
                                  <td style={{ padding: "10px 12px", color: "#555" }}>₹{Number(item.price_per_unit).toLocaleString()}</td>
                                  <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, color: "#111" }}>₹{Number(item.total_price).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {bills.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>No bills yet</p>
          </div>
        )}
      </div>

      {/* New Bill Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "720px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>New Bill</h2>
            </div>
            {error && <div style={{ background: "#111", borderLeft: "4px solid #C8102E", color: "white", padding: "12px 16px", fontSize: "13px", marginBottom: "16px", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Shop</label>
                <SearchableSelect options={shopOptions} value={form.shop_id} onChange={val => setForm({ ...form, shop_id: val })} placeholder="Search shop name or owner..." required />
{form.shop_id && (() => {
  const s = shops.find(s => s.id === form.shop_id);
  if (!s) return null;
  return (
    <div style={{ marginTop: "8px", fontSize: "13px", color: "#555", fontFamily: "'Barlow Condensed', sans-serif", display: "flex", gap: "16px" }}>
      {s.route_name && <span>📍 {s.route_name}</span>}
      {s.phone && <span>📞 {s.phone}</span>}
    </div>
  );
})()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <label style={labelStyle}>Driver <span style={{ color: "#C8102E" }}>*</span></label>
                  <select className="input" style={{ marginTop: "6px" }} value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })} required>
                    <option value="">Select Driver</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` — ${d.phone}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Delivery Date</label>
                  <input type="date" className="input" style={{ marginTop: "6px" }} value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} required />
                </div>
              </div>
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "16px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={labelStyle}>Products</label>
                </div>
                {form.items.map((item, i) => {
                  const selectedProduct = products.find(p => p.id === item.product_id);
                  const stock = item.product_id ? (stockCache[item.product_id] ?? null) : null;
                  return (
                    <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "12px", marginBottom: "10px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div style={{ flex: 1 }}>
                          <SearchableSelect options={productOptions} value={item.product_id} onChange={val => updateItem(i, "product_id", val)} placeholder="Search product..." required />
                        </div>
                        {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "8px", flexShrink: 0 }}>✕</button>}
                      </div>
                      {selectedProduct && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <p style={{ fontSize: "13px", color: "#111", margin: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
                            ₹{selectedProduct.selling_price}/case &nbsp;|&nbsp; ₹{selectedProduct.selling_price_per_unit}/bottle &nbsp;|&nbsp; {selectedProduct.bottles_per_case} bottles/case
                          </p>
                          {stock !== null && (
                            <span style={{ fontSize: "13px", fontWeight: 800, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif", background: stock === "0C" ? "#C8102E" : "#111", padding: "4px 12px", borderRadius: "3px" }}>
                              Stock: {stock}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
                        <div>
                          <label style={labelStyle}>Cases</label>
                          <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_cases || ''} onChange={e => updateItem(i, "quantity_cases", e.target.value)} min="0" placeholder="0" />
                        </div>
                        <div>
                          <label style={labelStyle}>Extra Bottles</label>
                          <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_units || ''} onChange={e => updateItem(i, "quantity_units", e.target.value)} min="0" placeholder="0" />
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "#111" }}>₹{parseFloat(item.total_price || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={addItem} style={{ color: "#C8102E", fontSize: "15px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "8px", display: "block" }}>+ Add Product</button>
                <div style={{ textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.3rem", marginTop: "8px", borderTop: "2px solid #111", paddingTop: "8px" }}>
                  Total: ₹{grandTotal.toLocaleString()}
                </div>
              </div>
              <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "20px" }}>
                <label style={labelStyle}>Payment Mode</label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button type="button" style={modeBtn(form.payment_mode === "CASH", "#16a34a")} onClick={() => setForm({ ...form, payment_mode: "CASH", online_amount: "", paid_amount: "", paid_amount_cash: "" })}>Cash</button>
                  <button type="button" style={modeBtn(form.payment_mode === "ONLINE", "#2563eb")} onClick={() => setForm({ ...form, payment_mode: "ONLINE", online_amount: "", paid_amount: "", paid_amount_cash: "" })}>Online</button>
                  <button type="button" style={modeBtn(form.payment_mode === "SPLIT", "#7c3aed")} onClick={() => setForm({ ...form, payment_mode: "SPLIT", online_amount: "", paid_amount: "", paid_amount_cash: "" })}>Split</button>
                </div>

                {form.payment_mode !== "SPLIT" && (
                  <div style={{ marginTop: "14px" }}>
                    <label style={labelStyle}>Amount Paid ₹</label>
                    <input type="number" className="input" style={{ marginTop: "6px" }}
                      value={form.paid_amount}
                      onChange={e => setForm({ ...form, paid_amount: e.target.value })}
                      placeholder="0" min="0" />
                    {parseFloat(form.paid_amount) > 0 && (
                      <p style={{ fontSize: "12px", color: "#C8102E", marginTop: "6px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                        Pending: ₹{Math.max(0, grandTotal - parseFloat(form.paid_amount || 0)).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {form.payment_mode === "SPLIT" && (
                  <div style={{ marginTop: "12px", background: "#f5f3ff", borderLeft: "4px solid #7c3aed", padding: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ ...labelStyle, color: "#2563eb" }}>Online Amount ₹</label>
                        <input type="number" className="input" style={{ marginTop: "6px" }}
                          value={form.online_amount}
                          onChange={e => {
                            const online = parseFloat(e.target.value || 0);
                            setForm({ ...form, online_amount: e.target.value, paid_amount: (online + parseFloat(form.paid_amount_cash || 0)).toString() });
                          }}
                          placeholder="0" min="0" />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, color: "#16a34a" }}>Cash Amount ₹</label>
                        <input type="number" className="input" style={{ marginTop: "6px" }}
                          value={form.paid_amount_cash || ""}
                          onChange={e => {
                            const cash = parseFloat(e.target.value || 0);
                            setForm({ ...form, paid_amount_cash: e.target.value, paid_amount: (cash + parseFloat(form.online_amount || 0)).toString() });
                          }}
                          placeholder="0" min="0" />
                      </div>
                    </div>
                    {(parseFloat(form.online_amount || 0) + parseFloat(form.paid_amount_cash || 0)) > 0 && (
                      <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", color: "#7c3aed" }}>
                          Total Paid: ₹{(parseFloat(form.online_amount || 0) + parseFloat(form.paid_amount_cash || 0)).toLocaleString()}
                        </span>
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", color: "#C8102E" }}>
                          Pending: ₹{Math.max(0, grandTotal - parseFloat(form.online_amount || 0) - parseFloat(form.paid_amount_cash || 0)).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div>
                    <label style={labelStyle}>Free Products <span style={{ color: "#888", fontWeight: 400, textTransform: "none", fontSize: "11px" }}>(optional)</span></label>
                    {form.items.some(item => item.product_id && (parseFloat(item.quantity_cases||0) > 0 || parseFloat(item.quantity_units||0) > 0)) && (
                      <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "20px" }}>
                        <label style={labelStyle}>Bill Summary</label>
                        <div style={{ marginTop: "10px" }}>
                          {form.items.filter(item => item.product_id).map((item, i) => {
                            const p = products.find(p => p.id === item.product_id);
                            if (!p) return null;
                            const qty = [parseInt(item.quantity_cases||0) > 0 && `${item.quantity_cases} Cases`, parseInt(item.quantity_units||0) > 0 && `${item.quantity_units} Bottles`].filter(Boolean).join(" + ") || "—";
                              return (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #f0f0f0" }}>
                                  <div>
                                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "17px", textTransform: "uppercase", letterSpacing: "0.03em", color: "#111" }}>{p.name}</span>
                                    <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "14px", color: "#888", marginLeft: "14px", marginRight: "14px" }}>{qty}</span>
                                  </div>
                                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "17px", color: "#111" }}>₹{Number(item.total_price||0).toLocaleString()}</span>
                                </div>
                              );
                          })}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", marginTop: "4px" }}>
                            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#888" }}>Total</span>
                            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 800, fontSize: "20px", color: "#111" }}>₹{grandTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <p style={{ fontSize: "11px", color: "#bbb", margin: "2px 0 0", fontFamily: "'Barlow Condensed', sans-serif" }}>Won't affect inventory • Will appear in Free Products page</p>
                  </div>
                  <button type="button" onClick={addFreeItem} style={{ color: "#16a34a", fontSize: "12px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>+ Add Free Item</button>
                </div>
                {form.freeItems.length === 0 && (
                  <p style={{ fontSize: "13px", color: "#ccc", fontFamily: "'Barlow Condensed', sans-serif", textAlign: "center", padding: "8px 0" }}>No free products — click + Add Free Item to add</p>
                )}
                {form.freeItems.map((fi, i) => (
                  <div key={i} style={{ background: "#f0fdf4", borderLeft: "3px solid #16a34a", padding: "12px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...labelStyle, color: "#16a34a" }}>Product</label>
                        <SearchableSelect options={productOptions} value={fi.product_id} onChange={val => updateFreeItem(i, "product_id", val)} placeholder="Search product..." required />
                      </div>
                      <button type="button" onClick={() => removeFreeItem(i)} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "22px", flexShrink: 0 }}>✕</button>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, color: "#16a34a" }}>Bottles (free)</label>
                      <input type="number" className="input" style={{ marginTop: "4px" }} value={fi.quantity_units} onChange={e => updateFreeItem(i, "quantity_units", e.target.value)} min="1" placeholder="0" required />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Saving..." : "Generate Bill"}</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (() => {
        const b = editModal;
        const editGrandTotal = editItems.reduce((s, item) => s + parseFloat(item.total_price || 0), 0);
        const newPending = Math.max(0, editGrandTotal - parseFloat(editPaid || 0));
        const newStatus = parseFloat(editPaid || 0) >= editGrandTotal ? "CLEARED" : parseFloat(editPaid || 0) > 0 ? "PARTIAL" : "PENDING";

        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: "720px", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase" }}>Edit Bill</h2>
                <p style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>{b.bill_code || `#${b.bill_number}`} — {b.shop_name}</p>
              </div>

              <form onSubmit={handleEditSession}>
                {/* Items */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <label style={labelStyle}>Products</label>
                    <button type="button"
                      onClick={() => setEditItems(prev => [...prev, { product_id: "", quantity_cases: "0", quantity_units: "0", bottles_per_case: 24, price_per_case: "0", price_per_unit: "0", total_price: "0" }])}
                      style={{ color: "#C8102E", fontSize: "13px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      + Add Product
                    </button>
                  </div>

                  {editItems.map((item, i) => {
                    const selectedProduct = products.find(p => p.id === item.product_id);
                    return (
                      <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "12px", marginBottom: "10px" }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
                          <div style={{ flex: 1 }}>
                            <SearchableSelect options={productOptions} value={item.product_id}
                              onChange={val => updateEditItem(i, "product_id", val)} placeholder="Search product..." required />
                          </div>
                          {editItems.length > 1 && (
                            <button type="button" onClick={() => setEditItems(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "8px", flexShrink: 0 }}>✕</button>
                          )}
                        </div>
                        {selectedProduct && (
                          <p style={{ fontSize: "13px", color: "#111", margin: "0 0 10px", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
                            ₹{selectedProduct.selling_price}/case &nbsp;|&nbsp; ₹{selectedProduct.selling_price_per_unit}/bottle &nbsp;|&nbsp; {selectedProduct.bottles_per_case} bottles/case
                          </p>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
                          <div>
                            <label style={labelStyle}>Cases</label>
                            <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_cases}
                              onChange={e => updateEditItem(i, "quantity_cases", e.target.value)} min="0" placeholder="0" />
                          </div>
                          <div>
                            <label style={labelStyle}>Extra Bottles</label>
                            <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_units}
                              onChange={e => updateEditItem(i, "quantity_units", e.target.value)} min="0" placeholder="0" />
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ ...labelStyle, marginBottom: "4px" }}>Amount</p>
                            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.3rem", color: "#111" }}>
                              ₹{parseFloat(item.total_price || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.3rem", marginTop: "8px", borderTop: "2px solid #111", paddingTop: "8px" }}>
                    Total: ₹{editGrandTotal.toLocaleString()}
                  </div>
                </div>

                {/* Payment */}
                <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "20px" }}>
                  <label style={labelStyle}>Payment Mode</label>
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button type="button" style={modeBtn(editPaymentMode === "CASH", "#16a34a")} onClick={() => { setEditPaymentMode("CASH"); setEditOnlineAmount(""); setEditPaid(""); setEditPaidCash(""); }}>Cash</button>
                    <button type="button" style={modeBtn(editPaymentMode === "ONLINE", "#2563eb")} onClick={() => { setEditPaymentMode("ONLINE"); setEditOnlineAmount(""); setEditPaid(""); setEditPaidCash(""); }}>Online</button>
                    <button type="button" style={modeBtn(editPaymentMode === "SPLIT", "#7c3aed")} onClick={() => { setEditPaymentMode("SPLIT"); setEditOnlineAmount(""); setEditPaid(""); setEditPaidCash(""); }}>Split</button>
                  </div>

                  {editPaymentMode !== "SPLIT" && (
                    <div style={{ marginTop: "14px" }}>
                      <label style={labelStyle}>Amount Paid ₹</label>
                      <input type="number" className="input" style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700 }}
                        value={editPaid}
                        onChange={e => setEditPaid(e.target.value)}
                        placeholder="0" min="0" />
                      {editPaid !== "" && (
                        <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ ...labelStyle, color: newPending > 0 ? "#C8102E" : "#16a34a" }}>
                            Pending: ₹{newPending.toLocaleString()}
                          </span>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", padding: "4px 12px",
                            background: newStatus === "CLEARED" ? "#16a34a" : newStatus === "PARTIAL" ? "#C8102E" : "#e8e8e8",
                            color: newStatus === "PENDING" ? "#444" : "white" }}>
                            {newStatus}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {editPaymentMode === "SPLIT" && (
                    <div style={{ marginTop: "12px", background: "#f5f3ff", borderLeft: "4px solid #7c3aed", padding: "14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ ...labelStyle, color: "#2563eb" }}>Online Amount ₹</label>
                          <input type="number" className="input" style={{ marginTop: "6px" }}
                            value={editOnlineAmount}
                            onChange={e => {
                              const online = parseFloat(e.target.value || 0);
                              const cash = parseFloat(editPaidCash || 0);
                              setEditOnlineAmount(e.target.value);
                              setEditPaid((online + cash).toString());
                            }}
                            placeholder="0" min="0" />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, color: "#16a34a" }}>Cash Amount ₹</label>
                          <input type="number" className="input" style={{ marginTop: "6px" }}
                            value={editPaidCash || ""}
                            onChange={e => {
                              const cash = parseFloat(e.target.value || 0);
                              const online = parseFloat(editOnlineAmount || 0);
                              setEditPaidCash(e.target.value);
                              setEditPaid((cash + online).toString());
                            }}
                            placeholder="0" min="0" />
                        </div>
                      </div>
                      {(parseFloat(editOnlineAmount || 0) + parseFloat(editPaidCash || 0)) > 0 && (
                        <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", color: "#7c3aed" }}>
                            Total Paid: ₹{(parseFloat(editOnlineAmount || 0) + parseFloat(editPaidCash || 0)).toLocaleString()}
                          </span>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", color: newPending > 0 ? "#C8102E" : "#16a34a" }}>
                            Pending: ₹{Math.max(0, editGrandTotal - parseFloat(editOnlineAmount || 0) - parseFloat(editPaidCash || 0)).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Driver + Delivery */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                  <div>
                    <label style={labelStyle}>Assign Driver</label>
                    <select className="input" style={{ marginTop: "6px" }} value={editDriverId} onChange={e => setEditDriverId(e.target.value)}>
                      <option value="">No Driver</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` — ${d.phone}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Delivery Date</label>
                    <input type="date" className="input" style={{ marginTop: "6px" }} value={editDeliveryDate} onChange={e => setEditDeliveryDate(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={editLoading}>
                    {editLoading ? "Saving..." : "Save Changes"}
                  </button>
                  <button type="button" className="btn-outline" style={{ flex: 1 }}
                    onClick={() => { setEditModal(null); setEditItems([]); setEditPaid(""); setEditDriverId(""); setEditDeliveryDate(""); setEditPaymentMode("CASH"); setEditOnlineAmount(""); setEditPaidCash(""); }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}