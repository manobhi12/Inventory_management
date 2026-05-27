import { useEffect, useState } from "react";
import api from "../api/axios";

const CATEGORIES = ["RGB", "PET", "CAN", "TTP", "MTP"];
const empty = { name: "", category: "PET", size: "", bottles_per_case: "", selling_price: "", selling_price_per_unit: "", breakage_penalty: 3, is_returnable: true, company_id: "" };

export default function Products() {
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    api.get("/products").then(r => setProducts(r.data));
    api.get("/companies").then(r => setCompanies(r.data));
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (p) => { setForm(p); setEditing(p.id); setModal(true); };

  // ...existing code...
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      // parse numeric fields to allow decimals (no negatives) before sending
      const payload = {
        ...form,
        selling_price: form.selling_price === "" ? null : parseFloat(form.selling_price),
        selling_price_per_unit: form.selling_price_per_unit === "" ? null : parseFloat(form.selling_price_per_unit),
        bottles_per_case: form.bottles_per_case === "" ? null : parseFloat(form.bottles_per_case),
        breakage_penalty: form.breakage_penalty === "" ? null : parseFloat(form.breakage_penalty)
      };

      // basic validation
      if (payload.selling_price == null || Number.isNaN(payload.selling_price) || payload.selling_price < 0) {
        throw new Error("Selling price per case must be a non-negative number");
      }
      if (payload.selling_price_per_unit == null || Number.isNaN(payload.selling_price_per_unit) || payload.selling_price_per_unit < 0) {
        throw new Error("Selling price per bottle must be a non-negative number");
      }
      if (payload.bottles_per_case == null || Number.isNaN(payload.bottles_per_case) || payload.bottles_per_case <= 0) {
        throw new Error("Bottles per case must be a positive number");
      }

      if (editing) await api.put(`/products/${editing}`, payload);
      else await api.post("/products", payload);
      setModal(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || "Failed to save product");
    } finally {
      setLoading(false);
    }
  };
// ...existing code...

  const handleDelete = async (id) => {
    if (!confirm("Delete this product?")) return;
    await api.delete(`/products/${id}`);
    load();
  };

  const labelStyle = {
    fontSize: "11px",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 600
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Products</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>
            All products • Manage catalog
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          + Add Product
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              {["Name", "Category", "Size", "Bottles/Case", "Selling ₹/Case", "Selling ₹/Bottle", "Company", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="table-row">
                <td style={{ fontWeight: 600, fontSize: "16px", padding: "16px" }}>
                  {p.name}
                </td>
                <td style={{ padding: "16px" }}>
                  <span className="badge-red">{p.category}</span>
                </td>
                <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>
                  {p.size || "—"}
                </td>
                <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", padding: "16px" }}>
                  {p.bottles_per_case}
                </td>
                <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", padding: "16px" }}>
                  ₹{Number(p.selling_price).toLocaleString()}
                </td>
                <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", color: "#2563eb", padding: "16px" }}>
                  ₹{Number(p.selling_price_per_unit).toLocaleString()}
                </td>
                <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>
                  {p.company_name || "—"}
                </td>
                <td style={{ padding: "16px" }}>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <button onClick={() => openEdit(p)} style={actionBtn("#C8102E")}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(p.id)} style={actionBtn("#aaaaaa")}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "1.2rem",
              color: "#ccc",
              textTransform: "uppercase",
              letterSpacing: "0.1em"
            }}>
              No products yet
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "720px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "2rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em"
              }}>
                {editing ? "Edit Product" : "Add Product"}
              </h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Product Name</label>
                <input
                  className="input"
                  style={{ marginTop: "6px" }}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Size</label>
                  <input
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.size}
                    onChange={e => setForm({ ...form, size: e.target.value })}
                    placeholder="750ml"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Bottles per Case</label>
                  <input
                    type="number"
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.bottles_per_case}
                    onChange={e => setForm({ ...form, bottles_per_case: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div>
                  <label style={labelStyle}>Selling Price / Case ₹</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.selling_price}
                    onChange={e => setForm({ ...form, selling_price: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Selling Price / Bottle ₹</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.selling_price_per_unit}
                    onChange={e => setForm({ ...form, selling_price_per_unit: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Breakage Fee / Bottle ₹</label>
                  <input
                    type="number"
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.breakage_penalty}
                    onChange={e => setForm({ ...form, breakage_penalty: e.target.value })}
                    placeholder="3"
                  />
                </div>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Company</label>
                <select
                  className="input"
                  style={{ marginTop: "6px" }}
                  value={form.company_id}
                  onChange={e => setForm({ ...form, company_id: e.target.value })}
                >
                  <option value="">Select Company</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                <input
                  type="checkbox"
                  id="returnable"
                  checked={form.is_returnable}
                  onChange={e => setForm({ ...form, is_returnable: e.target.checked })}
                  style={{ accentColor: "#C8102E" }}
                />
                <label htmlFor="returnable" style={{ fontSize: "15px", color: "#444", fontWeight: 500 }}>
                  Returnable Bottles
                </label>
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