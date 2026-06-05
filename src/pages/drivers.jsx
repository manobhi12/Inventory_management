import React, { useEffect, useState } from "react";
import api from "../api/axios";

const today = new Date().toISOString().split("T")[0];
const emptyDriver = { name: "", phone: "" };
const emptyTrip = { trip_date: today, route_id: "", amount_received: "", notes: "" };

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

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyDriver);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  // Trip state
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [trips, setTrips] = useState({});
  const [tripModal, setTripModal] = useState(null); // driverId
  const [tripForm, setTripForm] = useState(emptyTrip);
  const [editingTrip, setEditingTrip] = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [loadSheetModal, setLoadSheetModal] = useState(null); // { id, name }
  const [loadSheetDate, setLoadSheetDate] = useState(today);

  const loadDrivers = () => {
    api.get("/drivers").then(r => setDrivers(Array.isArray(r.data) ? r.data : []));
  };

  const loadRoutes = () => {
    api.get("/routes").then(r => setRoutes(Array.isArray(r.data) ? r.data : []));
  };

  const loadTrips = (driverId) => {
    api.get(`/drivers/${driverId}/trips`).then(r => {
      setTrips(prev => ({ ...prev, [driverId]: Array.isArray(r.data) ? r.data : [] }));
    });
  };

  useEffect(() => {
    loadDrivers();
    loadRoutes();
  }, []);

  const openAdd = () => { setForm(emptyDriver); setEditing(null); setModal(true); };
  const openEdit = (d) => { setForm({ name: d.name, phone: d.phone || "" }); setEditing(d.id); setModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (editing) await api.put(`/drivers/${editing}`, form);
      else await api.post("/drivers", form);
      setModal(false);
      loadDrivers();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save driver");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this driver?")) return;
    await api.delete(`/drivers/${id}`);
    loadDrivers();
  };

  const toggleExpand = (driverId) => {
    if (expandedDriver === driverId) {
      setExpandedDriver(null);
    } else {
      setExpandedDriver(driverId);
      loadTrips(driverId);
    }
  };

  const openAddTrip = (driverId) => {
    setTripForm(emptyTrip);
    setEditingTrip(null);
    setTripModal(driverId);
  };

  const openEditTrip = (trip) => {
    setTripForm({
      amount_received: trip.amount_received,
      notes: trip.notes || "",
      trip_load: trip.trip_load || "",
      load_returned: trip.load_returned || ""
    });
    setEditingTrip(trip);
    setTripModal(trip.driver_id);
  };

  const handleTripSubmit = async (e) => {
    e.preventDefault();
    if (tripLoading) return;
    setTripLoading(true);
    const driverIdForReload = tripModal || expandedDriver;
    try {
      if (editingTrip) {
        await api.put(`/drivers/trips/${editingTrip.id}`, {
          amount_received: tripForm.amount_received,
          notes: tripForm.notes
        });
      } else {
        await api.post(`/drivers/${tripModal}/trips`, tripForm);
      }
      setTripModal(null);
      setEditingTrip(null);
      loadTrips(driverIdForReload);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save trip");
    } finally {
      setTripLoading(false);
    }
  };

  const printDriverLoadSheet = async (driverId, driverName, date) => {
    try {
      const res = await api.get(`/drivers/${driverId}/loadsheet?date=${date}`);
      const { items, routes, bills } = res.data;
      if (!bills.length) { alert("No bills found for this driver on selected date."); return; }

      const totalValue = items.reduce((s, item) => {
        const bpc = parseInt(item.bottles_per_case) || 24;
        const totalCases = Math.floor((parseInt(item.quantity_cases) * bpc + parseInt(item.quantity_units)) / bpc);
        const extraBottles = (parseInt(item.quantity_cases) * bpc + parseInt(item.quantity_units)) % bpc;
        return s + (totalCases * parseFloat(item.price_per_case)) + (extraBottles * parseFloat(item.price_per_unit));
      }, 0);

      const win = window.open('', '_blank');
      win.document.write(`<html><head><title>Load Sheet — ${driverName}</title>
        <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;font-size:12px;padding:20px;max-width:300px;width:300px;margin:auto;}
        .title{font-size:20px;font-weight:bold;text-align:center;margin-bottom:4px;}.center{text-align:center;font-size:12px;color:#111;margin-bottom:8px;}
        .driver{text-align:center;font-size:15px;font-weight:bold;margin-bottom:4px;}.line{border-top:2px dashed #000;margin:10px 0;}
        table{width:100%;border-collapse:collapse;}th{text-align:left;border-bottom:2px solid #000;padding:5px 4px;font-size:12px;text-transform:uppercase;}
        td{padding:8px 4px;border-bottom:1px dotted #ccc;font-size:14px;}.qty{text-align:center;font-size:16px;font-weight:bold;}
        @media print{body{padding:5px;max-width:300px;width:300px;}}</style>
      </head><body>
        <div class="title">LOAD SHEET</div>
        <div class="center">${new Date(date).toLocaleDateString('en-IN')} | ${bills.length} bill${bills.length > 1 ? 's' : ''}</div>
        <div class="center">${routes.join(", ") || ""}</div>
        <div class="driver">Driver: ${driverName}</div>
        <div class="line"></div>
        <table><thead><tr>
          <th>Product</th><th style="text-align:center">Cases</th><th style="text-align:center">Bottles</th><th style="text-align:right">Value</th>
        </tr></thead><tbody>
        ${items.map(item => {
          const bpc = parseInt(item.bottles_per_case) || 24;
          const total = parseInt(item.quantity_cases) * bpc + parseInt(item.quantity_units);
          const cases = Math.floor(total / bpc);
          const bottles = total % bpc;
          const value = (cases * parseFloat(item.price_per_case)) + (bottles * parseFloat(item.price_per_unit));
          return `<tr><td style="font-weight:bold">${item.product_name}</td><td class="qty">${cases}</td><td class="qty">${bottles}</td><td style="text-align:right;font-weight:bold">₹${value.toLocaleString()}</td></tr>`;
        }).join('')}
        </tbody></table>
        <div class="line"></div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold;padding:4px 0;">
          <span>TOTAL VALUE</span><span>₹${totalValue.toLocaleString()}</span>
        </div>
        <div class="line"></div>
        <div class="center">Total Bills: ${bills.length}</div>
      </body></html>`);
      win.document.close(); win.focus(); win.print(); win.close();
    } catch (err) {
      alert("Failed to generate load sheet");
    }
  };

  const handleDeleteTrip = async (tripId, driverId) => {
    if (!confirm("Delete this trip entry?")) return;
    await api.delete(`/drivers/trips/${tripId}`);
    loadTrips(driverId);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Drivers</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>
            All drivers • Trip history & payments
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          + Add Driver
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              {["Driver Name", "Phone", "Trip History", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map(d => {
              const isExpanded = expandedDriver === d.id;
              const driverTrips = trips[d.id] || [];
              const totalTrip = driverTrips.reduce((s, t) => s + parseFloat(t.total_trip_amount || 0), 0);
              const totalReceived = driverTrips.reduce((s, t) => s + parseFloat(t.amount_received || 0), 0);
              const balance = totalTrip - totalReceived;

              return (
                <React.Fragment key={d.id}>
                  <tr className="table-row">
                    <td style={{ fontWeight: 600, fontSize: "16px", padding: "16px" }}>
                      {d.name}
                    </td>
                    <td style={{ fontSize: "15px", padding: "16px" }}>
                      {d.phone || "—"}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button
                          onClick={() => toggleExpand(d.id)}
                          style={{
                            fontSize: "13px",
                            color: "#2563eb",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0
                          }}
                        >
                          {isExpanded ? "▲ Hide" : "▼ View History"}
                        </button>
                        <button
                          onClick={() => openAddTrip(d.id)}
                          style={{
                            fontSize: "13px",
                            color: "#C8102E",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em"
                          }}
                        >
                          + Add Trip
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", gap: "16px" }}>
                        <button onClick={() => { setLoadSheetModal({ id: d.id, name: d.name }); setLoadSheetDate(today); }} style={actionBtn("#7c3aed")}>Load Sheet</button>
                        <button onClick={() => openEdit(d)} style={actionBtn("#C8102E")}>Edit</button>
                        <button onClick={() => handleDelete(d.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded trip history */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} style={{ padding: "0 16px 16px 32px", background: "#f9fafb" }}>
                        <div style={{ paddingTop: "12px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#444",
                            textTransform: "uppercase"
                          }}>
                            Trip History
                          </span>
                          {driverTrips.length > 0 && (
                            <div style={{ display: "flex", gap: "20px" }}>
                              <span style={{ fontSize: "13px", color: "#888" }}>
                                Total Trip: <strong style={{ color: "#111" }}>₹{totalTrip.toLocaleString()}</strong>
                              </span>
                              <span style={{ fontSize: "13px", color: "#888" }}>
                                Received: <strong style={{ color: "#16a34a" }}>₹{totalReceived.toLocaleString()}</strong>
                              </span>
                              {balance !== 0 && (
                                <span style={{ fontSize: "13px", color: "#888" }}>
                                  Balance: <strong style={{ color: balance > 0 ? "#C8102E" : "#16a34a" }}>
                                    {balance > 0 ? `₹${balance.toLocaleString()} pending` : `₹${Math.abs(balance).toLocaleString()} excess`}
                                  </strong>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {driverTrips.length === 0 ? (
                          <p style={{ color: "#888", fontSize: "15px", padding: "12px 0" }}>No trips recorded yet</p>
                        ) : (
                          <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                                {["Date", "Route", "Trip Amount (from bills)", "Trip Load", "Returned", "Received", "Balance", "Notes", "Actions"].map(h => (
                                  <th key={h} style={{
                                    textAlign: "left",
                                    padding: "8px 12px",
                                    color: "#888",
                                    fontSize: "11px",
                                    textTransform: "uppercase",
                                    fontWeight: 600
                                  }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {driverTrips.map(t => {
                                const bal = parseFloat(t.total_trip_amount) - parseFloat(t.amount_received);
                                return (
                                  <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "10px 12px", color: "#555" }}>
                                      {new Date(t.trip_date).toLocaleDateString("en-IN")}
                                    </td>
                                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111" }}>
                                      {t.route_name || "—"}
                                    </td>
                                    <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "16px" }}>
                                      ₹{Number(t.total_trip_amount).toLocaleString()}
                                      <span style={{ fontSize: "11px", color: "#aaa", fontWeight: 400, marginLeft: "4px" }}>auto</span>
                                    </td>
                                    <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "15px" }}>
                                      {parseFloat(t.trip_load || 0) > 0 ? `₹${Number(t.trip_load).toLocaleString()}` : "—"}
                                    </td>
                                    <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "#16a34a" }}>
                                      {parseFloat(t.load_returned || 0) > 0 ? `₹${Number(t.load_returned).toLocaleString()}` : "—"}
                                    </td>
                                    <td style={{ padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "16px", color: "#16a34a" }}>
                                      ₹{Number(t.amount_received).toLocaleString()}
                                    </td>
                                    <td style={{ padding: "10px 12px" }}>
                                      {bal === 0 ? (
                                        <span className="badge-green">Settled</span>
                                      ) : bal > 0 ? (
                                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "#C8102E" }}>
                                          −₹{bal.toLocaleString()}
                                        </span>
                                      ) : (
                                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "#16a34a" }}>
                                          +₹{Math.abs(bal).toLocaleString()}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ padding: "10px 12px", color: "#888" }}>
                                      {t.notes || "—"}
                                    </td>
                                    <td style={{ padding: "10px 12px" }}>
                                      <div style={{ display: "flex", gap: "12px" }}>
                                        <button onClick={() => openEditTrip(t)} style={actionBtn("#C8102E")}>Edit</button>
                                        <button onClick={() => handleDeleteTrip(t.id, d.id)} style={actionBtn("#aaaaaa")}>Delete</button>
                                      </div>
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
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {drivers.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "1.2rem",
              color: "#ccc",
              textTransform: "uppercase",
              letterSpacing: "0.1em"
            }}>
              No drivers yet
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Driver Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "520px" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "2rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em"
              }}>
                {editing ? "Edit Driver" : "Add Driver"}
              </h2>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Driver Name</label>
                <input
                  className="input"
                  style={{ marginTop: "6px" }}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Phone</label>
                <input
                  className="input"
                  style={{ marginTop: "6px" }}
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
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

      {/* Load Sheet Modal */}
      {loadSheetModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "360px" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase" }}>
                Load Sheet
              </h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>{loadSheetModal.name}</p>
            </div>
            <div style={{ marginBottom: "24px" }}>
              <label style={labelStyle}>Select Date</label>
              <input type="date" className="input" style={{ marginTop: "6px" }}
                value={loadSheetDate} onChange={e => setLoadSheetDate(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button className="btn-primary" style={{ flex: 1 }}
                onClick={() => { printDriverLoadSheet(loadSheetModal.id, loadSheetModal.name, loadSheetDate); setLoadSheetModal(null); }}>
                Print
              </button>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setLoadSheetModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Trip Modal */}
      {tripModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "520px" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "2rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em"
              }}>
                {editingTrip ? "Edit Trip" : "Add Trip"}
              </h2>
            </div>

            {/* When editing — show read-only info */}
            {editingTrip && (
              <div style={{
                background: "#f8f8f8",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                padding: "12px 16px",
                marginBottom: "20px",
                display: "flex",
                gap: "24px"
              }}>
                <div>
                  <p style={{ ...labelStyle, marginBottom: "4px" }}>Date</p>
                  <p style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>
                    {new Date(editingTrip.trip_date).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <div>
                  <p style={{ ...labelStyle, marginBottom: "4px" }}>Route</p>
                  <p style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>
                    {editingTrip.route_name || "—"}
                  </p>
                </div>
                <div>
                  <p style={{ ...labelStyle, marginBottom: "4px" }}>Total (from bills)</p>
                  <p style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>
                    ₹{Number(editingTrip.total_trip_amount).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleTripSubmit}>
              {/* Only show date + route when adding new trip */}
              {!editingTrip && (
                <>
                  <div style={{ marginBottom: "20px" }}>
                    <label style={labelStyle}>Trip Date</label>
                    <input
                      type="date"
                      className="input"
                      style={{ marginTop: "6px" }}
                      value={tripForm.trip_date}
                      onChange={e => setTripForm({ ...tripForm, trip_date: e.target.value })}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: "20px" }}>
                    <label style={labelStyle}>Route</label>
                    <select
                      className="input"
                      style={{ marginTop: "6px" }}
                      value={tripForm.route_id}
                      onChange={e => setTripForm({ ...tripForm, route_id: e.target.value })}
                      required
                    >
                      <option value="">Select Route</option>
                      {routes.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{
                    background: "#fffbea",
                    border: "1px solid #fde68a",
                    borderRadius: "6px",
                    padding: "10px 14px",
                    marginBottom: "20px"
                  }}>
                    <p style={{ fontSize: "13px", color: "#92400e", margin: 0 }}>
                      Trip total will be auto-calculated from bills assigned to this driver on the selected date &amp; route.
                    </p>
                  </div>
                </>
              )}

              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Trip Load ₹</label>
                <input type="number" className="input" style={{ marginTop: "6px" }}
                  value={tripForm.trip_load || ""} onChange={e => setTripForm({ ...tripForm, trip_load: e.target.value })}
                  min="0" placeholder="0" />
              </div>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Load Returned ₹</label>
                <input type="number" className="input" style={{ marginTop: "6px" }}
                  value={tripForm.load_returned || ""} onChange={e => setTripForm({ ...tripForm, load_returned: e.target.value })}
                  min="0" placeholder="0" />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Amount Received ₹</label>
                <input
                  type="number"
                  className="input"
                  style={{ marginTop: "6px" }}
                  value={tripForm.amount_received}
                  onChange={e => setTripForm({ ...tripForm, amount_received: e.target.value })}
                  required
                  min="0"
                />
              </div>

              {/* Balance preview when editing */}
              {editingTrip && tripForm.amount_received !== "" && (
                <div style={{
                  background: "#f8f8f8",
                  borderLeft: "4px solid #C8102E",
                  padding: "12px",
                  marginBottom: "20px"
                }}>
                  {(() => {
                    const bal = parseFloat(editingTrip.total_trip_amount || 0) - parseFloat(tripForm.amount_received || 0);
                    return (
                      <p style={{ fontSize: "15px", fontWeight: 700, color: bal === 0 ? "#16a34a" : bal > 0 ? "#C8102E" : "#16a34a", margin: 0 }}>
                        {bal === 0 ? "Fully settled" : bal > 0 ? `₹${bal.toLocaleString()} still pending` : `₹${Math.abs(bal).toLocaleString()} excess paid`}
                      </p>
                    );
                  })()}
                </div>
              )}

              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  className="input"
                  style={{ marginTop: "6px", minHeight: "70px" }}
                  value={tripForm.notes}
                  onChange={e => setTripForm({ ...tripForm, notes: e.target.value })}
                  placeholder="Optional notes..."
                />
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={tripLoading}>
                  {tripLoading ? "Saving..." : "Save"}
                </button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setTripModal(null); setEditingTrip(null); }}>
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