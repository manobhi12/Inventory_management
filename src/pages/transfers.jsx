/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useRef } from "react";
import api from "../api/axios";

function SearchableSelect({ options, value, onChange, placeholder = "Search..." }) {
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
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input className="input" style={{ marginTop: "6px", width: "100%", boxSizing: "border-box" }}
        value={open ? query : (selected ? selected.label : "")}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={() => { setQuery(""); setOpen(true); }}
        placeholder={placeholder} autoComplete="off" />
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#fff", border: "2px solid #e5e7eb", borderRadius: "4px", zIndex: 9999, maxHeight: "220px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          {filtered.length === 0
            ? <div style={{ padding: "12px 16px", fontSize: "13px", color: "#aaa", fontFamily: "'Barlow Condensed', sans-serif" }}>No results</div>
            : filtered.map((opt, i) => (
              <div key={i} onMouseDown={() => { onChange(opt.value); setQuery(""); setOpen(false); }}
                style={{ padding: "10px 16px", fontSize: "14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontFamily: "'Barlow Condensed', sans-serif", background: opt.value === value ? "#fff8f8" : "transparent", borderLeft: opt.value === value ? "3px solid #C8102E" : "3px solid transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                onMouseLeave={e => e.currentTarget.style.background = opt.value === value ? "#fff8f8" : "transparent"}
              >{opt.label}</div>
            ))}
        </div>
      )}
    </div>
  );
}

const labelStyle = { fontSize: "13px", color: "#111", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 };
const actionBtn = (color) => ({ color, fontSize: "15px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" });
const emptyItem = { product_id: "", quantity_cases: "", quantity_units: "" };

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState({ from_godown_id: "", to_godown_id: "", items: [{ ...emptyItem }] });
  const [editForm, setEditForm] = useState({ items: [{ ...emptyItem }] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [expanded, setExpanded] = useState({});

  const load = async () => {
    const res = await api.get("/transfers");
    setTransfers(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => {
    load();
    api.get("/godowns").then(r => setGodowns(r.data));
    api.get("/products").then(r => setProducts(r.data));
    api.get("/inventory").then(r => setInventory(r.data));
  }, []);

  const godownOptions = godowns.map(g => ({ value: g.id, label: g.name }));
  const productOptions = products.map(p => ({ value: p.id, label: p.name }));

  const getStock = (godown_id, product_id) => {
    const row = inventory.find(i => String(i.godown_id) === String(godown_id) && String(i.product_id) === String(product_id));
    if (!row) return null;
    return `${row.quantity_cases}C ${row.quantity_units}B`;
  };

  // Form handlers
  const updateItem = (i, field, val, isEdit = false) => {
    const setter = isEdit ? setEditForm : setForm;
    setter(prev => {
      const items = [...prev.items];
      items[i] = { ...items[i], [field]: val };
      return { ...prev, items };
    });
  };
  const addItem = (isEdit = false) => {
    const setter = isEdit ? setEditForm : setForm;
    setter(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  };
  const removeItem = (i, isEdit = false) => {
    const setter = isEdit ? setEditForm : setForm;
    setter(prev => ({ ...prev, items: prev.items.filter((_, idx) => idx !== i) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!form.from_godown_id || !form.to_godown_id) { setError("Select both godowns"); return; }
    if (form.from_godown_id === form.to_godown_id) { setError("From and To must be different"); return; }
    if (form.items.some(i => !i.product_id)) { setError("Select a product for all items"); return; }
    setLoading(true);
    try {
      await api.post("/transfers", {
        from_godown_id: form.from_godown_id,
        to_godown_id: form.to_godown_id,
        items: form.items.map(i => ({ product_id: i.product_id, quantity_cases: parseInt(i.quantity_cases || 0), quantity_units: parseInt(i.quantity_units || 0) }))
      });
      setModal(false);
      setForm({ from_godown_id: "", to_godown_id: "", items: [{ ...emptyItem }] });
      load();
      api.get("/inventory").then(r => setInventory(r.data));
    } catch (err) {
      setError(err.response?.data?.error || "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (t) => {
    setEditForm({
      items: t.items.map(i => ({ product_id: i.product_id, quantity_cases: i.quantity_cases, quantity_units: i.quantity_units }))
    });
    setEditError("");
    setEditModal(t);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setEditError("");
    setLoading(true);
    try {
      await api.put(`/transfers/${editModal.id}`, {
        items: editForm.items.map(i => ({ product_id: i.product_id, quantity_cases: parseInt(i.quantity_cases || 0), quantity_units: parseInt(i.quantity_units || 0) }))
      });
      setEditModal(null);
      load();
      api.get("/inventory").then(r => setInventory(r.data));
    } catch (err) {
      setEditError(err.response?.data?.error || "Update failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this transfer? Inventory will be restored.")) return;
    try {
      await api.delete(`/transfers/${id}`);
      load();
      api.get("/inventory").then(r => setInventory(r.data));
    } catch (err) {
      alert(err.response?.data?.error || "Delete failed");
    }
  };

  const renderItems = (items) => {
    if (!items?.length) return null;
    const totalCases = items.reduce((s, i) => s + (parseInt(i.quantity_cases) || 0), 0);
    const totalUnits = items.reduce((s, i) => s + (parseInt(i.quantity_units) || 0), 0);
    if (items.length === 1) {
      const p = products.find(p => p.id === items[0].product_id);
      return <span style={{ fontSize: "14px", color: "#555" }}>{p?.name} — {items[0].quantity_cases}C {items[0].quantity_units}B</span>;
    }
    return (
      <span style={{ fontSize: "14px", color: "#555" }}>
        {items.length} products — {totalCases}C {totalUnits}B total
      </span>
    );
  };

  const renderItemForm = (items, isEdit = false) => (
    <>
      {items.map((item, i) => {
        const p = products.find(p => p.id === item.product_id);
        const stock = item.product_id && (isEdit ? editModal?.from_godown_id : form.from_godown_id)
          ? getStock(isEdit ? editModal.from_godown_id : form.from_godown_id, item.product_id) : null;
        return (
          <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "12px", marginBottom: "10px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
              <div style={{ flex: 1 }}>
                <SearchableSelect options={productOptions} value={item.product_id} onChange={val => updateItem(i, "product_id", val, isEdit)} placeholder="Search product..." />
              </div>
              {items.length > 1 && <button type="button" onClick={() => removeItem(i, isEdit)} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginTop: "8px", flexShrink: 0 }}>✕</button>}
            </div>
            {p && stock !== undefined && (
                <p style={{ fontSize: "15px", color: "#111", margin: "0 0 8px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                {stock ? `Stock: ${stock}` : (isEdit ? editModal?.from_godown_id : form.from_godown_id) ? "No stock in source godown" : ""}
                </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Cases</label>
                <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_cases} onChange={e => updateItem(i, "quantity_cases", e.target.value === "" ? "" : Number(e.target.value), isEdit)} min="0" placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>Extra Bottles</label>
                <input type="number" className="input" style={{ marginTop: "4px" }} value={item.quantity_units} onChange={e => updateItem(i, "quantity_units", e.target.value === "" ? "" : Number(e.target.value), isEdit)} min="0" placeholder="0" />
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => addItem(isEdit)} style={{ color: "#C8102E", fontSize: "15px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "16px" }}>+ Add Product</button>
    </>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Transfers</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", margin: 0 }}>Transfer Stock Between Godowns</p>
            <button onClick={() => { setForm({ from_godown_id: "", to_godown_id: "", items: [{ ...emptyItem }] }); setError(""); setModal(true); }}
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", background: "none", border: "2px solid #C8102E", color: "#C8102E", padding: "4px 14px", borderRadius: "4px", cursor: "pointer" }}>
              + New Transfer
            </button>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              {["Date", "From", "To", "Products", "Actions"].map(h => <th key={h} style={{ padding: "12px 16px" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {transfers.map(t => (
              <>
                <tr key={t.id} className="table-row">
                  <td style={{ color: "#555", fontSize: "15px", padding: "16px" }}>{new Date(t.created_at).toLocaleDateString("en-IN")}</td>
                  <td style={{ fontWeight: 600, fontSize: "15px", padding: "16px" }}>{t.from_godown_name}</td>
                  <td style={{ fontWeight: 600, fontSize: "15px", padding: "16px", color: "#2563eb" }}>{t.to_godown_name}</td>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {renderItems(t.items)}
                      {t.items?.length > 1 && (
                        <button onClick={() => setExpanded(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#888", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                          {expanded[t.id] ? "▲" : "▼"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", gap: "16px" }}>
                      <button onClick={() => openEdit(t)} style={actionBtn("#C8102E")}>Edit</button>
                      <button onClick={() => handleDelete(t.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                    </div>
                  </td>
                </tr>
                {expanded[t.id] && t.items?.length > 1 && (
                  <tr key={`${t.id}-expanded`}>
                    <td colSpan={5} style={{ padding: "0 16px 16px 56px", background: "#f9fafb", borderBottom: "2px solid #f0f0f0" }}>
                      <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse", marginTop: "12px" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                            {["Product", "Cases", "Bottles"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#888", fontSize: "13px", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t.items.map(item => {
                            const p = products.find(p => p.id === item.product_id);
                            return (
                              <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{item.product_name || p?.name}</td>
                                <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700 }}>{item.quantity_cases}</td>
                                <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700 }}>{item.quantity_units}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {transfers.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>No transfers yet</p>
          </div>
        )}
      </div>

      {/* New Transfer Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "620px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>New Transfer</h2>
            </div>
            {error && <div style={{ background: "#111", borderLeft: "4px solid #C8102E", color: "white", padding: "12px 16px", fontSize: "13px", marginBottom: "16px", fontFamily: "'Barlow Condensed', sans-serif" }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <label style={labelStyle}>From Godown</label>
                  <SearchableSelect options={godownOptions} value={form.from_godown_id} onChange={val => setForm({ ...form, from_godown_id: val })} placeholder="Select source..." />
                </div>
                <div>
                  <label style={labelStyle}>To Godown</label>
                  <SearchableSelect options={godownOptions} value={form.to_godown_id} onChange={val => setForm({ ...form, to_godown_id: val })} placeholder="Select destination..." />
                </div>
              </div>
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "16px" }}>
                <label style={{ ...labelStyle, marginBottom: "12px", display: "block" }}>Products</label>
                {renderItemForm(form.items, false)}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Transferring..." : "Transfer"}</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "620px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>Edit Transfer</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>{editModal.from_godown_name} → {editModal.to_godown_name}</p>
            </div>
            {editError && <div style={{ background: "#111", borderLeft: "4px solid #C8102E", color: "white", padding: "12px 16px", fontSize: "13px", marginBottom: "16px", fontFamily: "'Barlow Condensed', sans-serif" }}>{editError}</div>}
            <form onSubmit={handleEdit}>
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "16px" }}>
                <label style={{ ...labelStyle, marginBottom: "12px", display: "block" }}>Products</label>
                {renderItemForm(editForm.items, true)}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Saving..." : "Save Changes"}</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setEditModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}