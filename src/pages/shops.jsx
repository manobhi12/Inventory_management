import React, { useEffect, useState } from "react";
import api from "../api/axios";

const empty = { name: "", owner_name: "", phone: "", route_id: "" };

export default function Shops() {
  const [shops, setShops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [bills, setBills] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [expandedShop, setExpandedShop] = useState(null);
  const [search, setSearch] = useState("");

  // Cash payment modal
  const [cashModal, setCashModal] = useState(null); // shop object
  const [cashAmount, setCashAmount] = useState("");
  const [cashLoading, setCashLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    api.get("/shops").then(r => setShops(Array.isArray(r.data) ? r.data : []));
    api.get("/bills").then(r => setBills(Array.isArray(r.data) ? r.data : []));
  };
  useEffect(() => {
    load();
    api.get("/routes").then(r => setRoutes(Array.isArray(r.data) ? r.data : []));
  }, []);

  const getShopStats = (shopId) => {
    const shopBills = bills.filter(b => b.shop_id === shopId);
    const totalBilled = shopBills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
    const totalPaid = shopBills.reduce((s, b) => s + parseFloat(b.paid_amount || 0), 0);
    const totalPending = shopBills.reduce((s, b) => s + parseFloat(b.pending_amount || 0), 0);
    const unpaidBills = shopBills.filter(b => b.status !== "CLEARED");
    return { totalBilled, totalPaid, totalPending, unpaidBills, totalBills: shopBills.length };
  };

  const openAdd = () => { setForm(empty); setEditing(null); setModal(true); };
  const openEdit = (s) => { setForm(s); setEditing(s.id); setModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (editing) await api.put(`/shops/${editing}`, form);
      else await api.post("/shops", form);
      setModal(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save shop");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this shop?")) return;
    await api.delete(`/shops/${id}`);
    load();
  };

  const handleCashPayment = async (e) => {
    e.preventDefault();
    if (cashLoading || !cashAmount) return;
    setCashLoading(true);
    try {
      await api.post(`/bills/shop/${cashModal.id}/cash-payment`, { amount: parseFloat(cashAmount) });
      setCashModal(null);
      setCashAmount("");
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to apply payment");
    } finally {
      setCashLoading(false);
    }
  };

  const labelStyle = {
    fontSize: "11px", color: "#888", textTransform: "uppercase",
    letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600
  };

  const actionBtn = (color) => ({
    color, fontSize: "15px", background: "none", border: "none", cursor: "pointer",
    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em"
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Shops</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>All shops • Latest on top</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Shop</button>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <input
          className="input"
          placeholder="Search shop name or owner..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: "360px" }}
       />
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              {["Shop Name", "Owner", "Phone", "Route", "Pending / Paid", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shops.filter(s => {
              const q = search.trim().toLowerCase();
              if (!q) return true;
              return s.name?.toLowerCase().includes(q) || s.owner_name?.toLowerCase().includes(q);
            }).map(s => {
              const stats = getShopStats(s.id);
              const isExpanded = expandedShop === s.id;
              const hasUnpaid = stats.unpaidBills.length > 0;

              return (
                <React.Fragment key={s.id}>
                  <tr className="table-row" style={{ background: hasUnpaid ? "#fff8f8" : "" }}>
                    <td style={{ padding: "16px" }}>
                      <div style={{ fontWeight: 600, fontSize: "16px" }}>{s.name}</div>
                      {hasUnpaid && (
                        <div style={{ fontSize: "13px", color: "#C8102E", marginTop: "4px" }}>
                          {stats.unpaidBills.length} bill{stats.unpaidBills.length > 1 ? "s" : ""} unpaid
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: "15px", padding: "16px" }}>{s.owner_name || "—"}</td>
                    <td style={{ fontSize: "15px", padding: "16px" }}>{s.phone || "—"}</td>
                    <td style={{ padding: "16px" }}>
                      <span className="badge-gray">{s.route_name || "—"}</span>
                    </td>
                    <td style={{ padding: "16px" }}>
                      {stats.totalBills > 0 ? (
                        <div>
                          {/* Pending — big and prominent */}
                          {stats.totalPending > 0 ? (
                            <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "20px", color: "#C8102E" }}>
                              ₹{stats.totalPending.toLocaleString()} <span style={{ fontSize: "12px", fontWeight: 500, color: "#C8102E", opacity: 0.7 }}>pending</span>
                            </div>
                          ) : (
                            <span className="badge-green">Cleared</span>
                          )}
                          {/* Total / Paid — small secondary */}
                          <div style={{ fontSize: "12px", color: "#aaa", marginTop: "4px", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                            ₹{stats.totalPaid.toLocaleString()} paid &nbsp;/&nbsp; ₹{stats.totalBilled.toLocaleString()} total
                          </div>
                          {hasUnpaid && (
                            <div style={{ display: "flex", gap: "8px", marginTop: "6px", alignItems: "center" }}>
                              <button
                                onClick={() => setExpandedShop(isExpanded ? null : s.id)}
                                style={{ fontSize: "13px", color: "#888", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                {isExpanded ? "▲ Hide" : "▼ Bills"}
                              </button>
                              <span style={{ color: "#ddd" }}>|</span>
                              <button
                                onClick={() => { setCashModal(s); setCashAmount(""); }}
                                style={{ fontSize: "13px", color: "#C8102E", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}
                              >
                                + Cash Payment
                              </button>
                            </div>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", gap: "16px" }}>
                        <button onClick={() => openEdit(s)} style={actionBtn("#C8102E")}>Edit</button>
                        <button onClick={() => handleDelete(s.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded bills */}
                  {isExpanded && stats.unpaidBills.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "0 16px 16px 32px", background: "#fff5f5" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#444", textTransform: "uppercase", marginBottom: "8px", paddingTop: "12px" }}>
                          Unpaid Bills
                        </div>
                        <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #fee2e2" }}>
                              {["Bill #", "Date", "Total", "Paid"].map(h => (
                                <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#888", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stats.unpaidBills.map(b => (
                              <tr key={b.id} style={{ borderBottom: "1px solid #fee2e2" }}>
                                <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, color: "#C8102E" }}>{b.bill_code || `#${b.bill_number}`}</td>
                                <td style={{ padding: "10px 12px", color: "#555" }}>{new Date(b.created_at).toLocaleDateString("en-IN")}</td>
                                <td style={{ padding: "10px 12px", fontWeight: 600 }}>₹{Number(b.total_amount).toLocaleString()}</td>
                                <td style={{ padding: "10px 12px", color: "#16a34a", fontWeight: 600 }}>₹{Number(b.paid_amount || 0).toLocaleString()}</td>
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

        {shops.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>No shops yet</p>
          </div>
        )}
      </div>

      {/* Add/Edit Shop Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {editing ? "Edit Shop" : "Add Shop"}
              </h2>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Shop Name</label>
                <input className="input" style={{ marginTop: "6px" }} value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Owner Name</label>
                <input className="input" style={{ marginTop: "6px" }} value={form.owner_name}
                  onChange={e => setForm({ ...form, owner_name: e.target.value })} />
              </div>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Phone</label>
                <input className="input" style={{ marginTop: "6px" }} value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Route</label>
                <select className="input" style={{ marginTop: "6px" }} value={form.route_id}
                  onChange={e => setForm({ ...form, route_id: e.target.value })}>
                  <option value="">Select Route</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Saving..." : "Save"}</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Payment Modal */}
      {cashModal && (() => {
        const stats = getShopStats(cashModal.id);
        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: "400px" }}>
              <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase" }}>
                  Cash Payment
                </h2>
                <p style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>{cashModal.name}</p>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={labelStyle}>Total Billed</span>
                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700 }}>₹{stats.totalBilled.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={labelStyle}>Total Paid</span>
                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, color: "#16a34a" }}>₹{stats.totalPaid.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                  <span style={labelStyle}>Outstanding</span>
                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, color: "#C8102E" }}>₹{stats.totalPending.toLocaleString()}</span>
                </div>
              </div>

              <form onSubmit={handleCashPayment}>
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Cash Amount Received ₹</label>
                  <input
                    type="number" className="input"
                    style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700 }}
                    value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                    placeholder="0" min="1" required autoFocus
                  />
                  <p style={{ fontSize: "12px", color: "#888", marginTop: "6px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Will be applied to oldest unpaid bill first
                  </p>
                </div>

                {cashAmount > 0 && (
                  <div style={{ background: "#f0fdf4", borderLeft: "4px solid #16a34a", padding: "12px", marginBottom: "20px" }}>
                    <p style={{ fontSize: "15px", fontWeight: 700, color: "#16a34a", margin: 0 }}>
                      ₹{Number(cashAmount).toLocaleString()} will be applied to bills
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", gap: "12px" }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={cashLoading}>
                    {cashLoading ? "Applying..." : "Apply Payment"}
                  </button>
                  <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setCashModal(null); setCashAmount(""); }}>
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