import { useEffect, useState, useRef } from "react";
import api from "../api/axios";

const today = new Date().toISOString().split("T")[0];

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

  const handleSelect = (opt) => { onChange(opt.value); setQuery(""); setOpen(false); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input className="input" style={{ marginTop: "6px", width: "100%", boxSizing: "border-box" }}
        value={open ? query : (selected ? selected.label : "")}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={() => { setQuery(""); setOpen(true); }}
        placeholder={placeholder} autoComplete="off" />
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

export default function Breakage() {
  const [breakages, setBreakages] = useState([]);
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ shop_id: "", product_id: "", quantity_bottles: "", reason: "", breakage_date: today });

  const load = () => api.get("/breakage").then(r => setBreakages(r.data));
  useEffect(() => {
    load();
    api.get("/products").then(r => setProducts(r.data));
    api.get("/shops").then(r => setShops(Array.isArray(r.data) ? r.data : []));
  }, []);

  const selectedProduct = products.find(p => p.id === form.product_id);
  const estimatedPenalty = (parseInt(form.quantity_bottles || 0)) * parseFloat(selectedProduct?.breakage_penalty || 3);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await api.post("/breakage", form);
      setModal(false);
      setForm({ shop_id: "", product_id: "", quantity_bottles: "", reason: "", breakage_date: today });
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save breakage");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this breakage record?")) return;
    try {
      await api.delete(`/breakage/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete");
    }
  };

  const totalPenalty = breakages.reduce((s, b) => s + parseFloat(b.total_penalty || 0), 0);

  const labelStyle = {
    fontSize: "13px",
    color: "#111",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700
  };

  const actionBtn = (color) => ({
    color,
    fontSize: "15px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  });

  const getReasonStyle = (reason) => {
    if (reason?.includes("company")) {
      return { background: "#fef3c7", color: "#92400e", padding: "4px 12px", borderRadius: "9999px", fontSize: "13px", fontWeight: 600 };
    }
    if (reason?.includes("godown")) {
      return { background: "#fee2e2", color: "#991b1b", padding: "4px 12px", borderRadius: "9999px", fontSize: "13px", fontWeight: 600 };
    }
    return { background: "#ede9fe", color: "#5b21b6", padding: "4px 12px", borderRadius: "9999px", fontSize: "13px", fontWeight: 600 };
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Breakage</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>
            Track broken bottles and penalties
          </p>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          {breakages.length > 0 && (
            <div style={{ textAlign: "right" }}>
              <p style={labelStyle}>Total Penalty</p>
              <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#C8102E" }}>
                ₹{totalPenalty.toLocaleString()}
              </p>
            </div>
          )}
          <button className="btn-primary" onClick={() => setModal(true)}>
            + Add Breakage
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              {["Date", "Product", "Shop", "Godown", "Bottles Broken", "Penalty/Bottle", "Total Penalty", "Reason", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakages.map(b => (
              <tr key={b.id} className="table-row">
                <td style={{ color: "#555", fontSize: "15px", padding: "16px" }}>
                  {new Date(b.breakage_date).toLocaleDateString("en-IN")}
                </td>
                <td style={{ fontWeight: 600, fontSize: "16px", padding: "16px" }}>{b.product_name}</td>
                <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>{b.shop_name || <span style={{ color: "#ccc" }}>—</span>}</td>
                <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>{b.godown_name}</td>
                <td style={{ padding: "16px" }}>
                  <span className="badge-red">{b.quantity_bottles} bottles</span>
                </td>
                <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", padding: "16px" }}>
                  ₹{b.penalty_per_bottle}
                </td>
                <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", color: "#C8102E", padding: "16px" }}>
                  ₹{Number(b.total_penalty).toLocaleString()}
                </td>
                <td style={{ padding: "16px" }}>
                  <span style={getReasonStyle(b.reason)}>{b.reason || "—"}</span>
                </td>
                <td style={{ padding: "16px" }}>
                  <button onClick={() => handleDelete(b.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {breakages.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              No breakage records
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Add Breakage
              </h2>
            </div>

            <form onSubmit={handleSubmit}>

              {/* Shop */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Shop <span style={{ color: "#C8102E", fontWeight: 400, textTransform: "none", fontSize: "11px" }}>(optional)</span></label>
                <SearchableSelect
                  options={shops.map(s => ({ value: s.id, label: s.owner_name ? `${s.name} — ${s.owner_name}` : s.name }))}
                  value={form.shop_id}
                  onChange={val => setForm({ ...form, shop_id: val })}
                  placeholder="Search shop name or owner..."
                />
              </div>

              {/* Product */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Product <span style={{ color: "#C8102E" }}>*</span></label>
                <SearchableSelect
                  options={products.map(p => ({ value: p.id, label: p.name }))}
                  value={form.product_id}
                  onChange={val => setForm({ ...form, product_id: val })}
                  placeholder="Search product..."
                  required
                />
                {selectedProduct && (
                  <p style={{ fontSize: "13px", color: "#555", marginTop: "6px", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
                    Penalty: ₹{selectedProduct.breakage_penalty}/bottle
                  </p>
                )}
              </div>

              {/* Bottles + Date */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <label style={labelStyle}>No. of Bottles Broken <span style={{ color: "#C8102E" }}>*</span></label>
                  <input
                    type="number"
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.quantity_bottles}
                    onChange={e => setForm({ ...form, quantity_bottles: e.target.value })}
                    required
                    min="1"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.breakage_date}
                    onChange={e => setForm({ ...form, breakage_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Breakage Location */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Breakage Location <span style={{ color: "#C8102E" }}>*</span></label>
                <select
                  className="input"
                  style={{ marginTop: "6px" }}
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  required
                >
                  <option value="">Select Location</option>
                  <option value="Breakage while purchasing from company">While purchasing from company</option>
                  <option value="Breakage in godown / while loading">In godown / while loading</option>
                  <option value="Breakage at shop / reseller">At shop / reseller</option>
                </select>
              </div>

              {/* Penalty Summary */}
              {estimatedPenalty > 0 && (
                <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Total Penalty</p>
                      <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 800, fontSize: "1.8rem", color: "#C8102E", margin: "4px 0 0" }}>
                        ₹{estimatedPenalty.toLocaleString()}
                      </p>
                    </div>
                    <p style={{ fontSize: "13px", color: "#888", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em", margin: 0 }}>
                      {form.quantity_bottles} bottles × ₹{selectedProduct?.breakage_penalty}
                    </p>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? "Saving..." : "Save Breakage"}
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