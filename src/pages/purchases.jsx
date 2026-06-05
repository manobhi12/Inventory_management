/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import api from "../api/axios";

const today = new Date().toISOString().split("T")[0];

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [editPaid, setEditPaid] = useState("");
  const [loadingNew, setLoadingNew] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editPurchaseModal, setEditPurchaseModal] = useState(null); // holds full purchase object
  const [editPurchaseForm, setEditPurchaseForm] = useState(null);
  const [loadingEditPurchase, setLoadingEditPurchase] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [form, setForm] = useState({
    company_id: "",
    purchase_date: today,
    paid_amount: "",
    gst_amount: "",
    transport_cost: "",
    items: [{ product_id: "", quantity_cases: "", price_per_case: "", total_price: "" }]
  });

  const load = async () => {
    const res = await api.get("/purchases");
    let filtered = res.data;

    if (startDate) {
      const start = new Date(startDate).setHours(0, 0, 0, 0);
      filtered = filtered.filter(p => new Date(p.purchase_date).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).setHours(23, 59, 59, 999);
      filtered = filtered.filter(p => new Date(p.purchase_date).getTime() <= end);
    }

    setPurchases(filtered);
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      await load();
      const [companiesRes, productsRes] = await Promise.all([
        api.get("/companies"),
        api.get("/products")
      ]);
      setCompanies(companiesRes.data);
      setProducts(productsRes.data);
    };
    fetchInitialData();
  }, []);

  const applyFilter = () => { load(); };
  const clearFilter = () => { setStartDate(""); setEndDate(""); load(); };

  const openEditPurchase = async (p) => {
    const res = await api.get(`/purchases/${p.id}/items`);
    setEditPurchaseForm({
      company_id: p.company_id,
      purchase_date: p.purchase_date?.split("T")[0] || today,
      gst_amount: p.gst_amount || "",
      transport_cost: p.transport_cost || "",
      items: res.data.map(i => ({
        product_id: i.product_id,
        quantity_cases: i.quantity_cases,
        price_per_case: i.price_per_case,
        total_price: i.total_price
      })),
      addPayment: ""
    });
    setEditPurchaseModal(p);
  };

  const updateEditItem = (i, field, value) => {
    const items = [...editPurchaseForm.items];
    items[i][field] = value;
    if (field === "quantity_cases" || field === "price_per_case") {
      const qty = parseFloat(items[i].quantity_cases || 0);
      const price = parseFloat(items[i].price_per_case || 0);
      items[i].total_price = (qty * price).toFixed(2);
    }
    setEditPurchaseForm({ ...editPurchaseForm, items });
  };

  const handleEditPurchaseSave = async () => {
    if (loadingEditPurchase) return;
    setLoadingEditPurchase(true);
    try {
      await api.put(`/purchases/${editPurchaseModal.id}`, editPurchaseForm);
      const adding = parseFloat(editPurchaseForm.addPayment || 0);
      if (adding > 0) {
        await api.post(`/purchases/${editPurchaseModal.id}/payment`, { paid_amount: adding });
      }
      setEditPurchaseModal(null);
      setEditPurchaseForm(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update purchase");
    } finally {
      setLoadingEditPurchase(false);
    }
  };

  const openAdd = () => {
    setForm({
      company_id: "",
      purchase_date: today,
      paid_amount: "",
      gst_amount: "",
      transport_cost: "",
      items: [{ product_id: "", quantity_cases: "", price_per_case: "", total_price: "" }]
    });
    setModal(true);
  };

  const updateItem = (i, field, value) => {
    const items = [...form.items];
    items[i][field] = value;
    if (field === "quantity_cases" || field === "price_per_case") {
      const qty = parseFloat(items[i].quantity_cases || 0);
      const price = parseFloat(items[i].price_per_case || 0);
      items[i].total_price = (qty * price).toFixed(2); // store as string with 2 decimals
    }
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { product_id: "", quantity_cases: "", price_per_case: "", total_price: "" }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const itemsTotal = form.items.reduce((s, i) => s + parseFloat(i.total_price || 0), 0);
  const gst = parseFloat(form.gst_amount || 0);
  const transport = parseFloat(form.transport_cost || 0);
  const grandTotal = itemsTotal + gst + transport;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loadingNew) return;
    setLoadingNew(true);
    try {
      await api.post("/purchases", form);
      setModal(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save purchase");
    } finally {
      setLoadingNew(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this purchase? Inventory will be reversed.")) return;
    await api.delete(`/purchases/${id}`);
    load();
  };

  const handleEditSave = async () => {
    if (loadingEdit) return;
    setLoadingEdit(true);
    try {
      const adding = parseFloat(editPaid || 0);
      await api.post(`/purchases/${editModal}/payment`, { paid_amount: adding });
      setEditModal(null);
      setEditPaid("");
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save payment");
    } finally {
      setLoadingEdit(false);
    }
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
          <h1 className="section-title">Purchases</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>
            All purchases • Latest on top
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          + New Purchase
        </button>
      </div>

      {/* Date Range Filter */}
      <div style={{
        background: "#f8f8f8",
        borderLeft: "4px solid #C8102E",
        padding: "16px",
        marginBottom: "24px",
        borderRadius: "4px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input
              type="date"
              className="input"
              style={{ marginTop: "6px" }}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input
              type="date"
              className="input"
              style={{ marginTop: "6px" }}
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button className="btn-primary" onClick={applyFilter} style={{ marginTop: "20px" }}>
              Apply Filter
            </button>
            <button className="btn-outline" onClick={clearFilter} style={{ marginTop: "20px" }}>
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              {["Date", "Company", "Godown", "Items", "GST", "Transport", "Total", "Paid", "Pending", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {purchases.map(p => {
              const pending = Math.max(0, parseFloat(p.total_amount) - parseFloat(p.paid_amount || 0));
              const itemsAmt = parseFloat(p.total_amount) - parseFloat(p.gst_amount || 0) - parseFloat(p.transport_cost || 0);

              return (
                <tr key={p.id} className="table-row">
                  <td style={{ color: "#555", fontSize: "15px", padding: "16px" }}>
                    {new Date(p.purchase_date).toLocaleDateString("en-IN")}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: "16px", padding: "16px" }}>
                    {p.company_name}
                  </td>
                  <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>
                    {p.godown_name}
                  </td>
                  <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", padding: "16px" }}>
                    ₹{itemsAmt.toLocaleString()}
                  </td>
                  <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "16px" }}>
                    ₹{Number(p.gst_amount || 0).toLocaleString()}
                  </td>
                  <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "16px" }}>
                    ₹{Number(p.transport_cost || 0).toLocaleString()}
                  </td>
                  <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", padding: "16px" }}>
                    ₹{Number(p.total_amount).toLocaleString()}
                  </td>
                  <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", color: "#16a34a", padding: "16px" }}>
                    ₹{Number(p.paid_amount || 0).toLocaleString()}
                  </td>
                  <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "19px", color: "#C8102E", padding: "16px" }}>
                    ₹{pending.toLocaleString()}
                  </td>
                  <td style={{ padding: "16px" }}>
                    <span className={
                      p.payment_status === "PAID" ? "badge-green" :
                      p.payment_status === "PARTIAL" ? "badge-red" :
                      "badge-gray"
                    }>
                      {p.payment_status}
                    </span>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", gap: "16px" }}>
                      <button
                        onClick={() => openEditPurchase(p)}
                        style={actionBtn("#2563eb")}
                      >
                        Edit
                      </button>
                      <button onClick={() => handleDelete(p.id)} style={actionBtn("#aaaaaa")}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {purchases.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              No purchases yet
            </p>
          </div>
        )}
      </div>

      {/* New Purchase Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "760px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                New Purchase
              </h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div>
                  <label style={labelStyle}>Company</label>
                  <select
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.company_id}
                    onChange={e => setForm({ ...form, company_id: e.target.value })}
                    required
                  >
                    <option value="">Select Company</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Purchase Date</label>
                  <input
                    type="date"
                    className="input"
                    style={{ marginTop: "6px" }}
                    value={form.purchase_date}
                    onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <label style={labelStyle}>Items</label>
                  <button
                    type="button"
                    onClick={addItem}
                    style={{ color: "#C8102E", fontSize: "12px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    + Add Item
                  </button>
                </div>

                {form.items.map((item, i) => (
                  <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "16px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <label style={labelStyle}>Item {i + 1}</label>
                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          style={{ color: "#aaa", background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={labelStyle}>Product</label>
                      <select
                        className="input"
                        style={{ marginTop: "6px" }}
                        value={item.product_id}
                        onChange={e => updateItem(i, "product_id", e.target.value)}
                        required
                      >
                        <option value="">Select Product</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
                      <div>
                        <label style={labelStyle}>Cases</label>
                        <input
                          type="number"
                          step="1"
                          className="input"
                          style={{ marginTop: "6px" }}
                          value={item.quantity_cases}
                          onChange={e => updateItem(i, "quantity_cases", e.target.value)}
                          min="0"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Price per Case</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          inputMode="decimal"
                          className="input"
                          style={{ marginTop: "6px" }}
                          value={item.price_per_case}
                          onChange={e => updateItem(i, "price_per_case", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "#111" }}>
                          ₹{parseFloat(item.total_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div style={{ textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.3rem", marginTop: "8px", borderTop: "2px solid #111", paddingTop: "8px" }}>
                  Items Subtotal: ₹{itemsTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={labelStyle}>GST Amount</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      className="input"
                      style={{ marginTop: "6px" }}
                      value={form.gst_amount}
                      onChange={e => setForm({ ...form, gst_amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Transport Cost</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      className="input"
                      style={{ marginTop: "6px" }}
                      value={form.transport_cost}
                      onChange={e => setForm({ ...form, transport_cost: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: "#f8f8f8", borderLeft: "4px solid #16a34a", padding: "16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={labelStyle}>Grand Total</span>
                <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#16a34a" }}>
                  ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "20px" }}>
                <label style={labelStyle}>Amount Paid Now (0 if pending)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className="input"
                  style={{ marginTop: "6px" }}
                  value={form.paid_amount}
                  onChange={e => setForm({ ...form, paid_amount: e.target.value })}
                  placeholder="0"
                />
                {parseFloat(form.paid_amount) > 0 && grandTotal > 0 && (
                  <p style={{ fontSize: "12px", color: "#C8102E", marginTop: "6px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                    Pending: ₹{Math.max(0, grandTotal - parseFloat(form.paid_amount || 0)).toLocaleString()}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loadingNew}>
                  {loadingNew ? "Saving..." : "Save Purchase"}
                </button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Purchase Modal */}
      {editPurchaseModal && editPurchaseForm && (() => {
        const p = editPurchaseModal;
        const editItemsTotal = editPurchaseForm.items.reduce((s, i) => s + parseFloat(i.total_price || 0), 0);
        const editGst = parseFloat(editPurchaseForm.gst_amount || 0);
        const editTransport = parseFloat(editPurchaseForm.transport_cost || 0);
        const editGrandTotal = editItemsTotal + editGst + editTransport;
        const alreadyPaid = parseFloat(p.paid_amount || 0);
        const currentPending = Math.max(0, parseFloat(p.total_amount) - alreadyPaid);
        const addingNow = parseFloat(editPurchaseForm.addPayment || 0);
        const newPaid = Math.min(alreadyPaid + addingNow, parseFloat(p.total_amount));
        const newPending = Math.max(0, parseFloat(p.total_amount) - newPaid);
        const newStatus = newPaid >= parseFloat(p.total_amount) ? "PAID" : newPaid > 0 ? "PARTIAL" : "PENDING";

        const sectionLabel = {
          fontSize: "13px", color: "#111", textTransform: "uppercase",
          letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700
        };
        const metaLabel = {
          fontSize: "13px", color: "#888", textTransform: "uppercase",
          letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600
        };

        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: "760px", maxHeight: "90vh", overflowY: "auto" }}>

              {/* Header */}
              <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "24px" }}>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>
                  Edit Purchase
                </h2>
                <p style={{ fontSize: "13px", color: "#888", marginTop: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {p.company_name} · {new Date(p.purchase_date).toLocaleDateString("en-IN")}
                </p>
              </div>

              {/* Company + Date */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div>
                  <label style={sectionLabel}>Company</label>
                  <select className="input" style={{ marginTop: "6px", fontSize: "14px" }} value={editPurchaseForm.company_id}
                    onChange={e => setEditPurchaseForm({ ...editPurchaseForm, company_id: e.target.value })} required>
                    <option value="">Select Company</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={sectionLabel}>Purchase Date</label>
                  <input type="date" className="input" style={{ marginTop: "6px", fontSize: "14px" }} value={editPurchaseForm.purchase_date}
                    onChange={e => setEditPurchaseForm({ ...editPurchaseForm, purchase_date: e.target.value })} />
                </div>
              </div>

              {/* Items */}
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "16px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <label style={sectionLabel}>Items</label>
                  <button type="button"
                    onClick={() => setEditPurchaseForm({ ...editPurchaseForm, items: [...editPurchaseForm.items, { product_id: "", quantity_cases: "", price_per_case: "", total_price: "" }] })}
                    style={{ color: "#C8102E", fontSize: "13px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    + Add Item
                  </button>
                </div>

                {editPurchaseForm.items.map((item, i) => (
                  <div key={i} style={{ background: "#f8f8f8", borderLeft: "3px solid #e0e0e0", padding: "16px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span style={{ ...metaLabel }}>Item {i + 1}</span>
                      {editPurchaseForm.items.length > 1 && (
                        <button type="button"
                          onClick={() => setEditPurchaseForm({ ...editPurchaseForm, items: editPurchaseForm.items.filter((_, idx) => idx !== i) })}
                          style={{ color: "#aaa", background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
                      )}
                    </div>
                    <div style={{ marginBottom: "12px" }}>
                      <label style={metaLabel}>Product</label>
                      <select className="input" style={{ marginTop: "6px", fontSize: "14px" }} value={item.product_id}
                        onChange={e => updateEditItem(i, "product_id", e.target.value)} required>
                        <option value="">Select Product</option>
                        {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
                      <div>
                        <label style={metaLabel}>Cases</label>
                        <input type="number" step="1" className="input" style={{ marginTop: "6px", fontSize: "14px" }} value={item.quantity_cases}
                          onChange={e => updateEditItem(i, "quantity_cases", e.target.value)} min="0" placeholder="0" />
                      </div>
                      <div>
                        <label style={metaLabel}>Price / Case</label>
                        <input type="number" step="any" min="0" className="input" style={{ marginTop: "6px", fontSize: "14px" }} value={item.price_per_case}
                          onChange={e => updateEditItem(i, "price_per_case", e.target.value)} placeholder="0" />
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ ...metaLabel, marginBottom: "4px" }}>Amount</p>
                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.3rem", color: "#111" }}>
                          ₹{parseFloat(item.total_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div style={{ textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.2rem", marginTop: "8px", borderTop: "2px solid #111", paddingTop: "8px", color: "#111" }}>
                  Items Subtotal: ₹{editItemsTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* GST + Transport */}
              <div style={{ background: "#f8f8f8", borderLeft: "4px solid #C8102E", padding: "16px", marginBottom: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={sectionLabel}>GST Amount</label>
                    <input type="number" step="any" min="0" className="input" style={{ marginTop: "6px", fontSize: "14px" }} value={editPurchaseForm.gst_amount}
                      onChange={e => setEditPurchaseForm({ ...editPurchaseForm, gst_amount: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <label style={sectionLabel}>Transport Cost</label>
                    <input type="number" step="any" min="0" className="input" style={{ marginTop: "6px", fontSize: "14px" }} value={editPurchaseForm.transport_cost}
                      onChange={e => setEditPurchaseForm({ ...editPurchaseForm, transport_cost: e.target.value })} placeholder="0" />
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div style={{ background: "#f8f8f8", borderLeft: "4px solid #16a34a", padding: "16px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={sectionLabel}>Grand Total</span>
                <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#16a34a" }}>
                  ₹{editGrandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* ── Payment Section ── */}
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "20px", marginBottom: "24px" }}>
                <label style={{ ...sectionLabel, display: "block", marginBottom: "16px" }}>Payment</label>

                {/* Current status row */}
                <div style={{ marginBottom: "16px" }}>
                  {[
                    { label: "Total Amount", value: `₹${Number(p.total_amount).toLocaleString()}`, color: "#111" },
                    { label: "Already Paid", value: `₹${alreadyPaid.toLocaleString()}`, color: "#16a34a" },
                    { label: "Pending", value: `₹${currentPending.toLocaleString()}`, color: "#C8102E" },
                  ].map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
                      <span style={metaLabel}>{row.label}</span>
                      <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.2rem", color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <label style={metaLabel}>Add Payment Amount</label>
                <input type="number" className="input"
                  style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700 }}
                  value={editPurchaseForm.addPayment}
                  onChange={e => setEditPurchaseForm({ ...editPurchaseForm, addPayment: e.target.value })}
                  placeholder="0" min="0" max={currentPending} />

                {editPurchaseForm.addPayment !== "" && parseFloat(editPurchaseForm.addPayment) > 0 && (
                  <div style={{ background: "#f8f8f8", borderLeft: "4px solid #111", padding: "14px", marginTop: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={metaLabel}>New Pending</span>
                      <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem", color: newPending > 0 ? "#C8102E" : "#16a34a" }}>
                        ₹{newPending.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={metaLabel}>New Status</span>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "13px", padding: "4px 12px", background: newStatus === "PAID" ? "#16a34a" : newStatus === "PARTIAL" ? "#C8102E" : "#e8e8e8", color: newStatus === "PENDING" ? "#444" : "white" }}>
                        {newStatus}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={handleEditPurchaseSave} className="btn-primary" style={{ flex: 1 }} disabled={loadingEditPurchase}>
                  {loadingEditPurchase ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => { setEditPurchaseModal(null); setEditPurchaseForm(null); }} className="btn-outline" style={{ flex: 1 }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}