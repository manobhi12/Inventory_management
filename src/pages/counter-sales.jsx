/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useRef } from "react";
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

const toIST = (raw) => {
  if (!raw) return new Date();
  const utc = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  return new Date(utc);
};

const emptyItem = { product_id: "", quantity_cases: "", quantity_units: "", price_per_unit: "" };
const emptyFreeItem = { product_id: "", quantity_units: "" };

const labelStyle = { fontSize: "13px", color: "#111", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 };
const actionBtn = (color) => ({ color, fontSize: "15px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" });
const modeBtn = (active, color) => ({ flex: 1, padding: "8px", border: `2px solid ${active ? color : "#e5e7eb"}`, background: active ? color : "transparent", color: active ? "#fff" : "#888", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: "3px" });

export default function CounterSales() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(null); // holds item being edited
  const [editItem, setEditItem] = useState({ product_id: "", quantity_cases: "", quantity_units: "", price_per_unit: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [freeItems, setFreeItems] = useState([]);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [newGodown, setNewGodown] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [selectedGodown, setSelectedGodown] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editSessionModal, setEditSessionModal] = useState(null); // holds session being edited
  const [editSessionItems, setEditSessionItems] = useState([]);
  const [editPaymentMode, setEditPaymentMode] = useState("CASH");
  const [editOnlineAmount, setEditOnlineAmount] = useState("");
  const [editSessionLoading, setEditSessionLoading] = useState(false);

  const load = async () => {
    const res = await api.get("/counter-sales");
    let filtered = Array.isArray(res.data) ? res.data : [];
    if (startDate) { const start = new Date(startDate).setHours(0,0,0,0); filtered = filtered.filter(s => toIST(s.created_at).getTime() >= start); }
    if (endDate) { const end = new Date(endDate).setHours(23,59,59,999); filtered = filtered.filter(s => toIST(s.created_at).getTime() <= end); }
    if (selectedGodown) filtered = filtered.filter(s => s.godown_id === selectedGodown);
    setSales(filtered);
  };

  useEffect(() => {
    load();
    api.get("/products").then(r => setProducts(r.data));
    if (isAdmin) api.get("/godowns").then(r => setGodowns(r.data));
  }, []);

  const toggleExpand = async (saleId) => {
    if (expandedItems[saleId]) {
      setExpandedItems(prev => { const n = { ...prev }; delete n[saleId]; return n; });
      return;
    }
    setExpandedItems(prev => ({ ...prev, [saleId]: "loading" }));
    try {
      const res = await api.get(`/counter-sales/${saleId}/items`);
      setExpandedItems(prev => ({ ...prev, [saleId]: Array.isArray(res.data) ? res.data : [] }));
    } catch {
      setExpandedItems(prev => { const n = { ...prev }; delete n[saleId]; return n; });
    }
  };

  const refreshExpandedItems = async (saleId) => {
    const res = await api.get(`/counter-sales/${saleId}/items`);
    setExpandedItems(prev => ({ ...prev, [saleId]: Array.isArray(res.data) ? res.data : [] }));
  };

  const updateItem = (i, field, val) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const next = { ...item, [field]: val };
      if (field === "product_id") {
        const p = products.find(p => p.id === val);
        if (p) next.price_per_unit = p.selling_price_per_unit?.toString() || "";
      }
      return next;
    }));
  };

  const getBottles = (item) => {
    const p = products.find(p => p.id === item.product_id);
    const bpc = p?.bottles_per_case || 24;
    return (parseInt(item.quantity_cases || 0) * bpc) + parseInt(item.quantity_units || 0);
  };

  const getItemTotal = (item) => getBottles(item) * parseFloat(item.price_per_unit || 0);
  const grandTotal = items.reduce((s, item) => s + getItemTotal(item), 0);

  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateFreeItem = (i, field, val) => setFreeItems(prev => prev.map((fi, idx) => idx === i ? { ...fi, [field]: val } : fi));
  const addFreeItem = () => setFreeItems(prev => [...prev, { ...emptyFreeItem }]);
  const removeFreeItem = (i) => setFreeItems(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const payload = {
        payment_mode: paymentMode,
        online_amount: paymentMode === 'SPLIT' ? parseFloat(onlineAmount || 0) : undefined,
        godown_id: isAdmin ? newGodown : undefined,
        items: items.filter(item => item.product_id && getBottles(item) > 0).map(item => ({
          product_id: item.product_id,
          quantity_units: getBottles(item),
          price_per_unit: parseFloat(item.price_per_unit || 0)
        }))
      };
      if (!payload.items.length) { alert("Please add at least one item"); return; }

      const res = await api.post("/counter-sales", payload);
      const counter_sale_id = res.data.id;

      for (const fi of freeItems) {
        if (!fi.product_id || !fi.quantity_units) continue;
        await api.post("/free-products", {
          product_id: fi.product_id,
          quantity_units: parseInt(fi.quantity_units),
          given_date: new Date().toISOString().split("T")[0],
          notes: "Given with counter sale",
          sale_type: "COUNTER",
          counter_sale_id
        });
      }

      setModal(false);
      setItems([{ ...emptyItem }]);
      setFreeItems([]);
      setPaymentMode("CASH");
      setOnlineAmount("");
      setNewGodown("");
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to record sale");
    } finally {
      setLoading(false);
    }
  };

  // Edit item handlers
  const openEditItem = (item) => {
    const p = products.find(prod => prod.id === item.product_id);
    const bpc = p?.bottles_per_case || 24;
    setEditItem({
      id: item.id,
      counter_sale_id: item.counter_sale_id,
      product_id: item.product_id.toString(),
      quantity_cases: Math.floor(item.quantity_units / bpc).toString(),
      quantity_units: (item.quantity_units % bpc).toString(),
      price_per_unit: item.price_per_unit.toString()
    });
    setEditModal(item.id);
  };

  const updateEditItem = (field, val) => {
    setEditItem(prev => {
      const next = { ...prev, [field]: val };
      if (field === "product_id") {
        const p = products.find(p => p.id === val);
        if (p) next.price_per_unit = p.selling_price_per_unit?.toString() || "";
      }
      return next;
    });
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (editLoading) return;
    setEditLoading(true);
    try {
      const p = products.find(prod => prod.id === editItem.product_id);
      if (!p) throw new Error("Product not found");
      const bpc = p.bottles_per_case || 24;
      const totalBottles = (parseInt(editItem.quantity_cases || 0) * bpc) + parseInt(editItem.quantity_units || 0);
      if (totalBottles <= 0) { alert("Please enter valid quantity"); return; }

      await api.put(`/counter-sales/items/${editItem.id}`, {
        product_id: editItem.product_id,
        quantity_units: totalBottles,
        price_per_unit: parseFloat(editItem.price_per_unit || 0)
      });

      setEditModal(null);
      await refreshExpandedItems(editItem.counter_sale_id);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update item");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this sale? Inventory will be restored.")) return;
    try { await api.delete(`/counter-sales/${id}`); load(); }
    catch (err) { alert(err.response?.data?.error || "Failed to delete sale"); }
  };

  const openEditSession = async (sale) => {
    setEditSessionLoading(true);
    try {
      const res = await api.get(`/counter-sales/${sale.id}/items`);
      const loadedItems = res.data.map(item => {
        const p = products.find(prod => prod.id === item.product_id);
        const bpc = p?.bottles_per_case || 24;
        return {
          product_id: item.product_id,
          quantity_cases: Math.floor(item.quantity_units / bpc).toString(),
          quantity_units: (item.quantity_units % bpc).toString(),
          price_per_unit: item.price_per_unit.toString()
        };
      });
      setEditSessionItems(loadedItems.length ? loadedItems : [{ ...emptyItem }]);
      setEditPaymentMode(sale.payment_mode || "CASH");
      setEditOnlineAmount(sale.online_amount && parseFloat(sale.online_amount) > 0 ? sale.online_amount.toString() : "");
      setEditSessionModal(sale.id);
    } catch (err) {
      alert("Failed to load sale items");
    } finally {
      setEditSessionLoading(false);
    }
  };

  const updateEditSessionItem = (i, field, val) => {
    setEditSessionItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const next = { ...item, [field]: val };
      if (field === "product_id") {
        const p = products.find(p => p.id === val);
       if (p) next.price_per_unit = p.selling_price_per_unit?.toString() || "";
      }
      return next;
    }));
  };

  const getEditBottles = (item) => {
    const p = products.find(p => p.id === item.product_id);
    const bpc = p?.bottles_per_case || 24;
    return (parseInt(item.quantity_cases || 0) * bpc) + parseInt(item.quantity_units || 0);
  };

  const handleSubmitEditSession = async (e) => {
    e.preventDefault();
    if (editSessionLoading) return;
    setEditSessionLoading(true);
    try {
      const payload = {
        payment_mode: editPaymentMode,
        online_amount: editPaymentMode === 'SPLIT' ? parseFloat(editOnlineAmount || 0) : undefined,
        items: editSessionItems.filter(item => item.product_id && getEditBottles(item) > 0).map(item => ({
          product_id: item.product_id,
          quantity_units: getEditBottles(item),
          price_per_unit: parseFloat(item.price_per_unit || 0)
        }))
      };
      if (!payload.items.length) { alert("Please add at least one item"); return; }
      await api.put(`/counter-sales/${editSessionModal}`, payload);
      setEditSessionModal(null);
      setEditSessionItems([]);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update sale");
    } finally {
      setEditSessionLoading(false);
    }
  };

  const printCounterSale = async (sale) => {
  const items = (await api.get(`/counter-sales/${sale.id}/items`)).data;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Counter Sale #${sale.sale_number}</title>
    <style>
      @media print { body{margin:0;padding:8px;} }
      body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial; font-size:12px; color:#111; padding:20px; max-width:300px; width:300px; margin:auto; box-sizing:border-box; }
      .title { font-size:16px; font-weight:800; text-align:center; margin-bottom:4px; }
      .center { text-align:center; font-size:11px; color:#111; margin-bottom:8px; }
      .line { border-top:1px dashed #000; margin:8px 0; }
      .row { display:flex; justify-content:space-between; margin:4px 0; line-height:1; font-weight:700; }
      table { width:100%; border-collapse:collapse; margin:8px 0; font-size:12px; }
      th { text-align:left; font-size:11px; border-bottom:1px solid #000; padding:3px 0; text-transform:uppercase; color:#111; }
      td { padding:3px 0; font-size:12px; color:#111; }
      .num { font-family:"Roboto Mono","Courier New",monospace; font-variant-numeric:tabular-nums; }
      .right { text-align:right; }
      @media print { body{max-width:300px;width:300px;} }
    </style>
  </head><body>
    <div class="title">COUNTER SALE</div>
    <div class="center">${new Date(sale.created_at).toLocaleDateString('en-IN')} ${new Date(sale.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
    <div class="line"></div>
    <div class="row"><strong>Sale No.:</strong><strong class="num">#${sale.sale_number}</strong></div>
    <div class="row"><strong>Mode:</strong><strong class="num">${sale.payment_mode}</strong></div>
    <div class="line"></div>
    <table><thead><tr>
      <th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th>
    </tr></thead><tbody>
    ${items.map(item => {
      const bpc = item.bottles_per_case || 24;
      const cases = Math.floor(item.quantity_units / bpc);
      const bottles = item.quantity_units % bpc;
      const qty = `${cases > 0 ? cases + 'C' : ''}${bottles > 0 ? ' ' + bottles + 'B' : ''}` || item.quantity_units + 'B';
      return `<tr>
        <td style="font-weight:600">${item.product_name}</td>
        <td style="text-align:center">${qty}</td>
        <td class="right num">₹${Number(item.price_per_unit).toLocaleString()}</td>
        <td class="right num">₹${Number(item.total_amount).toLocaleString()}</td>
      </tr>`;
    }).join('')}
    </tbody></table>
    <div class="line"></div>
    <div class="row" style="font-size:13px;"><span>TOTAL</span><span class="num">₹${Number(sale.total_amount).toLocaleString()}</span></div>
    <div class="row" style="font-size:13px;color:#111;font-weight:600;"><span>Total Cases</span><span class="num">${items.reduce((s, i) => s + Math.floor(i.quantity_units / (i.bottles_per_case || 24)), 0)} cases</span></div>
    <div class="line"></div>
    <br/><div class="center" style="margin-top:12px;">Thank you!</div>
  </body></html>`);
  win.document.close(); win.focus(); win.print(); win.close();
};

  const productOptions = products.map(p => ({ value: p.id, label: p.name }));
  const selectedEditProduct = products.find(p => p.id === editItem.product_id);
  const editBpc = selectedEditProduct?.bottles_per_case || 24;
  const editTotalBottles = (parseInt(editItem.quantity_cases || 0) * editBpc) + parseInt(editItem.quantity_units || 0);
  const editItemTotal = editTotalBottles * parseFloat(editItem.price_per_unit || 0);

  const tableHeaders = ["Sale #", "Date", "Time", ...(isAdmin ? ["Godown"] : []), "Mode", "Total", "Actions"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Counter Sales</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>All sessions • Latest on top</p>
        </div>
        <button className="btn-primary" onClick={() => { setItems([{ ...emptyItem }]); setFreeItems([]); setModal(true); }}>+ New Sale</button>
      </div>

      {/* Filters */}
      <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "24px", borderRadius: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" className="input" style={{ marginTop: "6px" }} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" className="input" style={{ marginTop: "6px" }} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          {isAdmin && (
            <div>
              <label style={labelStyle}>Godown</label>
              <select className="input" style={{ marginTop: "6px" }} value={selectedGodown} onChange={e => setSelectedGodown(e.target.value)}>
                <option value="">All Godowns</option>
                {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-primary" onClick={load} style={{ marginTop: "20px" }}>Apply Filter</button>
            <button className="btn-outline" onClick={() => { setStartDate(""); setEndDate(""); setSelectedGodown(""); load(); }} style={{ marginTop: "20px" }}>Clear</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>{tableHeaders.map(h => <th key={h} style={{ padding: "12px 16px" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {sales.map(s => {
              const isExpanded = !!expandedItems[s.id];
              const isLoadingItems = expandedItems[s.id] === "loading";
              const saleItems = isExpanded && !isLoadingItems ? expandedItems[s.id] : [];
              const istDate = toIST(s.created_at);
              const isOnline = s.payment_mode === "ONLINE";

              return (
                <>
                  <tr key={s.id} className="table-row">
                    <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "20px", color: "#C8102E", padding: "16px" }}>
                      #{s.sale_number || "—"}
                    </td>
                    <td style={{ color: "#555", fontSize: "15px", padding: "16px" }}>{istDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                    <td style={{ color: "#888", fontSize: "14px", padding: "16px" }}>{istDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</td>
                    {isAdmin && <td style={{ color: "#888", fontSize: "14px", padding: "16px" }}>{s.godown_name || "—"}</td>}
                    <td style={{ padding: "16px" }}>
                      <span style={{
                        fontSize: "12px", fontWeight: 700, padding: "3px 10px",
                        fontFamily: "'Barlow Condensed', sans-serif", borderRadius: "3px",
                        background: s.payment_mode === "ONLINE" ? "#eff6ff" : s.payment_mode === "SPLIT" ? "#f5f3ff" : "#f0fdf4",
                        color: s.payment_mode === "ONLINE" ? "#2563eb" : s.payment_mode === "SPLIT" ? "#7c3aed" : "#16a34a",
                        border: `1px solid ${s.payment_mode === "ONLINE" ? "#bfdbfe" : s.payment_mode === "SPLIT" ? "#ddd6fe" : "#bbf7d0"}`
                      }}>
                        {s.payment_mode === "ONLINE" ? "Online" : s.payment_mode === "SPLIT" ? "Split" : "Cash"}
                      </span>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "20px", color: "#16a34a" }}>₹{Number(s.total_amount).toLocaleString()}</span>
                        <button onClick={() => toggleExpand(s.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontSize: "11px", color: "#888", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderRadius: "3px" }}>
                          {isLoadingItems ? "..." : isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", gap: "16px" }}>
                        <button onClick={() => printCounterSale(s)} style={actionBtn("#2563eb")}>Print</button>
                        <button onClick={() => openEditSession(s)} style={actionBtn("#C8102E")}>Edit</button>
                        <button onClick={() => handleDelete(s.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${s.id}-items`}>
                      <td colSpan={tableHeaders.length} style={{ padding: "0 16px 16px 40px", background: "#f9fafb", borderBottom: "2px solid #f0f0f0" }}>
                        {isLoadingItems ? (
                          <p style={{ padding: "12px 0", color: "#aaa", fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", fontSize: "13px" }}>Loading...</p>
                        ) : (
                          <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse", marginTop: "12px" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                                {["Product", "Qty", "Price/Bottle", "Amount", ""].map(h => (
                                  <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#888", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {saleItems.map(item => {
                                const bpc = item.bottles_per_case || 24;
                                const cases = Math.floor(item.quantity_units / bpc);
                                const bottles = item.quantity_units % bpc;
                                let qtyText = "";
                                if (cases > 0) qtyText += `${cases}C`;
                                if (bottles > 0) qtyText += `${qtyText ? " " : ""}${bottles}B`;
                                if (!qtyText) qtyText = `${item.quantity_units}B`;
                                return (
                                  <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111" }}>{item.product_name}</td>
                                    <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700 }}>{qtyText}</td>
                                    <td style={{ padding: "10px 12px", color: "#555" }}>₹{Number(item.price_per_unit).toLocaleString()}</td>
                                    <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, color: "#111" }}>₹{Number(item.total_amount).toLocaleString()}</td>
                                    <td style={{ padding: "10px 12px" }}>
                                      <button onClick={() => openEditItem(item)} style={actionBtn("#2563eb")}>Edit</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {sales.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>No counter sales yet</p>
          </div>
        )}
      </div>

      {/* New Sale Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "720px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>New Counter Sale</h2>
            </div>
            <form onSubmit={handleSubmit}>
              {isAdmin && (
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Godown</label>
                  <select className="input" style={{ marginTop: "6px" }} value={newGodown} onChange={e => setNewGodown(e.target.value)} required>
                    <option value="">Select Godown</option>
                    {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {items.map((item, i) => {
                const selectedProduct = products.find(p => p.id === item.product_id);
                const bpc = selectedProduct?.bottles_per_case || 24;
                const totalBottles = getBottles(item);
                const itemTotal = getItemTotal(item);
                return (
                  <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "12px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <SearchableSelect options={productOptions} value={item.product_id} onChange={val => updateItem(i, "product_id", val)} placeholder="Search product..." required />
                      </div>
                      {items.length > 1 && <button type="button" onClick={() => removeItem(i)} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "8px", flexShrink: 0 }}>✕</button>}
                    </div>
                    {selectedProduct && (
                      <p style={{ fontSize: "13px", color: "#111", margin: "0 0 10px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}>
                        ₹{selectedProduct.selling_price_per_unit}/bottle &nbsp;|&nbsp; {bpc} bottles/case
                      </p>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end", marginBottom: "12px" }}>
                      <div>
                        <label style={labelStyle}>Cases</label>
                        <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_cases} onChange={e => updateItem(i, "quantity_cases", e.target.value)} min="0" placeholder="0" />
                      </div>
                      <div>
                        <label style={labelStyle}>Extra Bottles</label>
                        <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_units} onChange={e => updateItem(i, "quantity_units", e.target.value)} min="0" placeholder="0" />
                      </div>
                      <div>
                        <label style={labelStyle}>Price / Bottle</label>
                        <input type="number" className="input" style={{ marginTop: "4px" }} value={item.price_per_unit} onChange={e => updateItem(i, "price_per_unit", e.target.value)} placeholder="0" required />
                      </div>
                    </div>
                    {totalBottles > 0 && (
                      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "14px", color: "#555" }}>{totalBottles} bottles</span>
                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.2rem", color: "#16a34a" }}>₹{itemTotal.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              <button type="button" onClick={addItem} style={{ color: "#C8102E", fontSize: "15px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "16px" }}>+ Add Product</button>

              {grandTotal > 0 && (
                <div style={{ background: "#f8f8f8", borderLeft: "4px solid #16a34a", padding: "16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={labelStyle}>Grand Total</span>
                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#16a34a" }}>₹{grandTotal.toLocaleString()}</span>
                </div>
              )}

              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Payment Mode</label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button type="button" style={modeBtn(paymentMode === "CASH", "#16a34a")} onClick={() => { setPaymentMode("CASH"); setOnlineAmount(""); }}>Cash</button>
                  <button type="button" style={modeBtn(paymentMode === "ONLINE", "#2563eb")} onClick={() => { setPaymentMode("ONLINE"); setOnlineAmount(""); }}>Online</button>
                  <button type="button" style={modeBtn(paymentMode === "SPLIT", "#7c3aed")} onClick={() => setPaymentMode("SPLIT")}>Split</button>
                </div>
                {paymentMode === "SPLIT" && grandTotal > 0 && (
                  <div style={{ marginTop: "12px", background: "#f5f3ff", borderLeft: "4px solid #7c3aed", padding: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ ...labelStyle, color: "#2563eb" }}>Online Amount ₹</label>
                        <input type="number" className="input" style={{ marginTop: "6px" }}
                          value={onlineAmount}
                          onChange={e => setOnlineAmount(e.target.value)}
                          placeholder="0" min="0" max={grandTotal} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, color: "#16a34a" }}>Cash Amount ₹</label>
                        <input type="number" className="input" style={{ marginTop: "6px", background: "#f0fdf4" }}
                          value={onlineAmount !== "" ? Math.max(0, grandTotal - parseFloat(onlineAmount || 0)).toFixed(2) : ""}
                          readOnly placeholder="Auto-calculated" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div>
                    <label style={labelStyle}>Free Products <span style={{ color: "#888", fontWeight: 400, textTransform: "none", fontSize: "11px" }}>(optional)</span></label>
                    <p style={{ fontSize: "11px", color: "#bbb", margin: "2px 0 0", fontFamily: "'Barlow Condensed', sans-serif" }}>Will appear in Free Products page</p>
                  </div>
                  <button type="button" onClick={addFreeItem} style={{ color: "#16a34a", fontSize: "12px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>+ Add Free Item</button>
                </div>
                {freeItems.length === 0 && (
                  <p style={{ fontSize: "13px", color: "#ccc", fontFamily: "'Barlow Condensed', sans-serif", textAlign: "center", padding: "8px 0" }}>No free products — click + Add Free Item to add</p>
                )}
                {freeItems.map((fi, i) => (
                  <div key={i} style={{ background: "#f0fdf4", borderLeft: "3px solid #16a34a", padding: "12px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...labelStyle, color: "#16a34a" }}>Product</label>
                        <SearchableSelect options={productOptions} value={fi.product_id} onChange={val => updateFreeItem(i, "product_id", val)} placeholder="Search product..." />
                      </div>
                      <button type="button" onClick={() => removeFreeItem(i)} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "22px", flexShrink: 0 }}>✕</button>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, color: "#16a34a" }}>Bottles (free)</label>
                      <input type="number" className="input" style={{ marginTop: "4px" }} value={fi.quantity_units} onChange={e => updateFreeItem(i, "quantity_units", e.target.value)} min="1" placeholder="0" />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Saving..." : "Record Sale"}</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "480px" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>Edit Item</h2>
            </div>
            <form onSubmit={handleSubmitEdit}>
              <div style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "16px", marginBottom: "20px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={labelStyle}>Product</label>
                  <SearchableSelect options={productOptions} value={editItem.product_id} onChange={val => updateEditItem("product_id", val)} placeholder="Search product..." required />
                  {selectedEditProduct && (
                    <p style={{ fontSize: "11px", color: "#aaa", marginTop: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {editBpc} bottles/case &nbsp;|&nbsp; ₹{selectedEditProduct.selling_price_per_unit}/bottle
                    </p>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end", marginBottom: "12px" }}>
                  <div>
                    <label style={labelStyle}>Cases</label>
                    <input type="number" className="input" style={{ marginTop: "6px" }} value={editItem.quantity_cases} onChange={e => updateEditItem("quantity_cases", e.target.value)} min="0" placeholder="0" />
                  </div>
                  <div>
                    <label style={labelStyle}>Extra Bottles</label>
                    <input type="number" className="input" style={{ marginTop: "6px" }} value={editItem.quantity_units} onChange={e => updateEditItem("quantity_units", e.target.value)} min="0" placeholder="0" />
                  </div>
                  <div>
                    <label style={labelStyle}>Price / Bottle</label>
                    <input type="number" className="input" style={{ marginTop: "6px" }} value={editItem.price_per_unit} onChange={e => updateEditItem("price_per_unit", e.target.value)} placeholder="0" required />
                  </div>
                </div>
                {editTotalBottles > 0 && (
                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "14px", color: "#555" }}>{editTotalBottles} bottles</span>
                    <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "#16a34a" }}>₹{editItemTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={editLoading}>{editLoading ? "Saving..." : "Save Changes"}</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setEditModal(null); setEditItem({ product_id: "", quantity_cases: "", quantity_units: "", price_per_unit: "" }); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editSessionModal && (
       <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "720px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>Edit Counter Sale</h2>
            </div>
            <form onSubmit={handleSubmitEditSession}>
              {editSessionItems.map((item, i) => {
                const selectedProduct = products.find(p => p.id === item.product_id);
                const bpc = selectedProduct?.bottles_per_case || 24;
                const totalBottles = getEditBottles(item);
                const itemTotal = totalBottles * parseFloat(item.price_per_unit || 0);
                return (
                  <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "12px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <SearchableSelect options={productOptions} value={item.product_id} onChange={val => updateEditSessionItem(i, "product_id", val)} placeholder="Search product..." required />
                      </div>
                     {editSessionItems.length > 1 && (
                        <button type="button" onClick={() => setEditSessionItems(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "8px", flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                    {selectedProduct && (
                      <p style={{ fontSize: "13px", color: "#111", margin: "0 0 10px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}>
                        ₹{selectedProduct.selling_price_per_unit}/bottle &nbsp;|&nbsp; {bpc} bottles/case
                      </p>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end", marginBottom: "12px" }}>
                      <div>
                        <label style={labelStyle}>Cases</label>
                        <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_cases} onChange={e => updateEditSessionItem(i, "quantity_cases", e.target.value)} min="0" placeholder="0" />
                      </div>
                      <div>
                        <label style={labelStyle}>Extra Bottles</label>
                        <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_units} onChange={e => updateEditSessionItem(i, "quantity_units", e.target.value)} min="0" placeholder="0" />
                      </div>
                      <div>
                        <label style={labelStyle}>Price / Bottle</label>
                        <input type="number" className="input" style={{ marginTop: "4px" }} value={item.price_per_unit} onChange={e => updateEditSessionItem(i, "price_per_unit", e.target.value)} placeholder="0" required />
                      </div>
                    </div>
                    {totalBottles > 0 && (
                      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "14px", color: "#555" }}>{totalBottles} bottles</span>
                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.2rem", color: "#16a34a" }}>₹{itemTotal.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              <button type="button" onClick={() => setEditSessionItems(prev => [...prev, { ...emptyItem }])}
                style={{ color: "#C8102E", fontSize: "15px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "16px" }}>
                + Add Product
              </button>

              {editSessionItems.reduce((s, item) => s + (getEditBottles(item) * parseFloat(item.price_per_unit || 0)), 0) > 0 && (
                <div style={{ background: "#f8f8f8", borderLeft: "4px solid #16a34a", padding: "16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={labelStyle}>Grand Total</span>
                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#16a34a" }}>
                    ₹{editSessionItems.reduce((s, item) => s + (getEditBottles(item) * parseFloat(item.price_per_unit || 0)), 0).toLocaleString()}
                  </span>
                </div>
              )}

              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Payment Mode</label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button type="button" style={modeBtn(editPaymentMode === "CASH", "#16a34a")} onClick={() => { setEditPaymentMode("CASH"); setEditOnlineAmount(""); }}>Cash</button>
                  <button type="button" style={modeBtn(editPaymentMode === "ONLINE", "#2563eb")} onClick={() => { setEditPaymentMode("ONLINE"); setEditOnlineAmount(""); }}>Online</button>
                  <button type="button" style={modeBtn(editPaymentMode === "SPLIT", "#7c3aed")} onClick={() => setEditPaymentMode("SPLIT")}>Split</button>
                </div>
                {editPaymentMode === "SPLIT" && (() => {
                  const editTotal = editSessionItems.reduce((s, item) => s + (getEditBottles(item) * parseFloat(item.price_per_unit || 0)), 0);
                  return editTotal > 0 && (
                    <div style={{ marginTop: "12px", background: "#f5f3ff", borderLeft: "4px solid #7c3aed", padding: "14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ ...labelStyle, color: "#2563eb" }}>Online Amount ₹</label>
                          <input type="number" className="input" style={{ marginTop: "6px" }}
                            value={editOnlineAmount}
                            onChange={e => setEditOnlineAmount(e.target.value)}
                            placeholder="0" min="0" max={editTotal} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, color: "#16a34a" }}>Cash Amount ₹</label>
                          <input type="number" className="input" style={{ marginTop: "6px", background: "#f0fdf4" }}
                            value={editOnlineAmount !== "" ? Math.max(0, editTotal - parseFloat(editOnlineAmount || 0)).toFixed(2) : ""}
                            readOnly placeholder="Auto-calculated" />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={editSessionLoading}>{editSessionLoading ? "Saving..." : "Save Changes"}</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setEditSessionModal(null); setEditSessionItems([]); setEditOnlineAmount(""); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}