import React, { useEffect, useState, useRef } from "react";
import api from "../api/axios";

// ── SearchableSelect ───────────────────────────────────────────────────────
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
            <div style={{ padding: "12px 16px", fontSize: "13px", color: "#aaa", fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase" }}>
              No results{query ? ` for "${query}"` : ""}
            </div>
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
// ──────────────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];
const emptyItem = { product_id: "", quantity_units: "" };
const emptyForm = { shop_id: "", given_date: today, notes: "", sale_type: "DELIVERY", items: [{ ...emptyItem }] };

const labelStyle = {
  fontSize: "11px", color: "#888", textTransform: "uppercase",
  letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600
};

const actionBtn = (color) => ({
  color, fontSize: "15px", background: "none", border: "none", cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em"
});

export default function FreeProducts() {
  const [entries, setEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = async (start = "", end = "") => {
    let url = "/free-products";
    if (start || end) {
      const params = new URLSearchParams();
      if (start) params.append("start", start);
      if (end) params.append("end", end);
      url += `?${params.toString()}`;
    }
    const res = await api.get(url);
    setEntries(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => {
    const init = async () => {
      await load();
      const [prodRes, shopsRes] = await Promise.all([api.get("/products"), api.get("/shops")]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setShops(Array.isArray(shopsRes.data) ? shopsRes.data : []);
    };
    init();
  }, []);

  const applyFilter = () => load(startDate, endDate);
  const clearFilter = () => { setStartDate(""); setEndDate(""); load(); };

  // Group entries by date + shop_id (null shop = its own group per entry)
  const groupEntries = () => {
    const groups = {};
    entries.forEach(e => {
      const dateStr = e.given_date ? e.given_date.split("T")[0] : "";
      const key = `${dateStr}__${e.shop_id || e.id}`; // unique per shop+date, or per row if no shop
      if (!groups[key]) {
        groups[key] = {
          key,
          given_date: e.given_date,
          shop_id: e.shop_id,
          shop_name: e.shop_name,
          rows: []
        };
      }
      groups[key].rows.push(e);
    });
    return Object.values(groups);
  };

  const grouped = groupEntries();

  const getRowValue = (entry) => {
    const product = products.find(p => p.id === entry.product_id);
    const price = product ? parseFloat(product.selling_price_per_unit || 0) : 0;
    return parseInt(entry.quantity_units || 0) * price;
  };

  const totalValue = entries.reduce((sum, e) => sum + getRowValue(e), 0);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setModal(true); };

  const openEdit = (entry) => {
    setForm({
      shop_id: entry.shop_id || "",
      given_date: entry.given_date ? entry.given_date.split("T")[0] : today,
      notes: entry.notes || "",
      sale_type: entry.sale_type || "DELIVERY",
      items: [{ product_id: entry.product_id, quantity_units: entry.quantity_units.toString() }]
    });
    setEditingId(entry.id);
    setModal(true);
  };

  const updateItem = (i, field, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: val };
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      if (editingId) {
        const item = form.items[0];
        await api.put(`/free-products/${editingId}`, {
          product_id: item.product_id,
          quantity_units: parseInt(item.quantity_units),
          notes: form.notes,
          given_date: form.given_date,
          shop_id: form.shop_id || null,
          sale_type: form.sale_type || 'DELIVERY'
        });
      } else {
        for (const item of form.items) {
          if (!item.product_id || !item.quantity_units) continue;
          await api.post("/free-products", {
            product_id: item.product_id,
            quantity_units: parseInt(item.quantity_units),
            notes: form.notes,
            given_date: form.given_date,
            shop_id: form.shop_id || null,
            sale_type: form.sale_type || 'DELIVERY'
          });
        }
      }
      setModal(false);
      load(startDate, endDate);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save entry");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete?")) return;
    await api.delete(`/free-products/${id}`);
    load(startDate, endDate);
  };

  const productOptions = products.map(p => ({ value: p.id, label: p.name }));
  const shopOptions = shops.map(s => ({ value: s.id, label: s.owner_name ? `${s.name} — ${s.owner_name}` : s.name }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Free Products</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>
            Items given free • Does not affect inventory or profit
          </p>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "1.6rem", fontWeight: 700, color: "#C8102E" }}>
            ₹{totalValue.toLocaleString()}
          </span>
          <button className="btn-primary" onClick={openAdd}>+ Add Entry</button>
        </div>
      </div>

      {/* Date Range Filter */}
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
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
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
              {["Date", "Shop", "Products", "Total Bottles", "Value", "Type", "Notes", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(group => {
              const isExpanded = expandedGroups[group.key];
              const totalBottles = group.rows.reduce((s, r) => s + parseInt(r.quantity_units || 0), 0);
              const groupValue = group.rows.reduce((s, r) => s + getRowValue(r), 0);
              const multipleProducts = group.rows.length > 1;

              // First product name for single display
              const firstProductName = group.rows[0]?.product_name || "—";
              const firstNotes = group.rows[0]?.notes;

              return (
                <React.Fragment key={group.key}>
                  <tr className="table-row">
                    <td style={{ color: "#555", fontSize: "15px", padding: "16px" }}>
                      {new Date(group.given_date).toLocaleDateString("en-IN")}
                    </td>
                    <td style={{ fontSize: "15px", padding: "16px", fontWeight: 500 }}>
                      {group.shop_name || <span style={{ color: "#ccc" }}>—</span>}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: "15px", padding: "16px" }}>
                      {multipleProducts ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>{firstProductName}</span>
                          <button
                            onClick={() => toggleGroup(group.key)}
                            style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}
                          >
                            {isExpanded ? "▲ hide" : `+${group.rows.length - 1} more`}
                          </button>
                        </div>
                      ) : (
                        <span>{firstProductName}</span>
                      )}
                    </td>
                    <td style={{ fontSize: "15px", fontWeight: 600, padding: "16px", color: "#111" }}>
                      {totalBottles}B
                    </td>
                    <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", color: "#C8102E", padding: "16px" }}>
                      ₹{groupValue.toLocaleString()}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span style={{
                        background: group.rows[0]?.sale_type === "COUNTER" ? "#ede9fe" : "#dbeafe",
                        color: group.rows[0]?.sale_type === "COUNTER" ? "#5b21b6" : "#1d4ed8",
                        padding: "4px 12px", borderRadius: "9999px", fontSize: "13px", fontWeight: 600
                      }}>
                        {group.rows[0]?.sale_type === "COUNTER" ? "Counter" : "Delivery"}
                      </span>
                    </td>
                    <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>
                      {firstNotes || "—"}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", gap: "16px" }}>
                        {!multipleProducts && (
                          <button onClick={() => openEdit(group.rows[0])} style={actionBtn("#C8102E")}>Edit</button>
                        )}
                        <button onClick={() => {
                          if (!confirm(`Delete all ${group.rows.length} item(s) in this group?`)) return;
                          Promise.all(group.rows.map(r => api.delete(`/free-products/${r.id}`))).then(() => load(startDate, endDate));
                        }} style={actionBtn("#aaaaaa")}>Delete</button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded rows */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} style={{ padding: "0 16px 12px 32px", background: "#f9fafb" }}>
                        <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse", marginTop: "8px" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                              {["Product", "Bottles", "Value", "Type", "Notes", "Actions"].map(h => (
                                <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#888", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map(r => (
                              <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.product_name}</td>
                                <td style={{ padding: "8px 12px" }}>{r.quantity_units}B</td>
                                <td style={{ padding: "8px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, color: "#C8102E" }}>₹{getRowValue(r).toLocaleString()}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{
                                    background: r.sale_type === "COUNTER" ? "#ede9fe" : "#dbeafe",
                                    color: r.sale_type === "COUNTER" ? "#5b21b6" : "#1d4ed8",
                                    padding: "3px 10px", borderRadius: "9999px", fontSize: "12px", fontWeight: 600
                                  }}>
                                    {r.sale_type === "COUNTER" ? "Counter" : "Delivery"}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px", color: "#888" }}>{r.notes || "—"}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ display: "flex", gap: "12px" }}>
                                    <button onClick={() => openEdit(r)} style={actionBtn("#C8102E")}>Edit</button>
                                    <button onClick={() => handleDelete(r.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {grouped.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              No free products recorded
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {editingId ? "Edit Entry" : "Add Free Products"}
              </h2>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Shop */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Shop (optional)</label>
                <SearchableSelect
                  options={shopOptions}
                  value={form.shop_id}
                  onChange={val => setForm({ ...form, shop_id: val })}
                  placeholder="Search shop..."
                />
              </div>

              {/* Date */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Date</label>
                <input type="date" className="input" style={{ marginTop: "6px" }}
                  value={form.given_date}
                  onChange={e => setForm({ ...form, given_date: e.target.value })}
                  required />
              </div>

              {/* Products */}
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <label style={labelStyle}>Products</label>
                  {!editingId && (
                    <button type="button" onClick={addItem}
                      style={{ color: "#C8102E", fontSize: "12px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      + Add Product
                    </button>
                  )}
                </div>

                {form.items.map((item, i) => (
                  <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "12px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Product</label>
                        <SearchableSelect
                          options={productOptions}
                          value={item.product_id}
                          onChange={val => updateItem(i, "product_id", val)}
                          placeholder="Search product..."
                          required
                        />
                      </div>
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)}
                          style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "22px", flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Number of Bottles</label>
                      <input type="number" className="input" style={{ marginTop: "6px" }}
                        value={item.quantity_units}
                        onChange={e => updateItem(i, "quantity_units", e.target.value)}
                        required min="1" placeholder="0" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Sale Type */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Sale Type</label>
                <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                  {["DELIVERY", "COUNTER"].map(type => (
                    <button key={type} type="button"
                      onClick={() => setForm({ ...form, sale_type: type })}
                      style={{
                        flex: 1, padding: "10px", border: "2px solid",
                        borderColor: form.sale_type === type ? (type === "COUNTER" ? "#5b21b6" : "#1d4ed8") : "#e5e7eb",
                        background: form.sale_type === type ? (type === "COUNTER" ? "#ede9fe" : "#dbeafe") : "#fff",
                        color: form.sale_type === type ? (type === "COUNTER" ? "#5b21b6" : "#1d4ed8") : "#888",
                        borderRadius: "4px", cursor: "pointer",
                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em"
                      }}>
                      {type === "DELIVERY" ? "🚚 Delivery" : "🏪 Counter"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Notes</label>
                <textarea className="input" style={{ marginTop: "6px", minHeight: "70px" }}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes..." />
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? "Saving..." : "Save"}
                </button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}