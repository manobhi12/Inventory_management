import { useEffect, useState } from "react";
import api from "../api/axios";

const labelStyle = {
  fontSize: "13px", color: "#111", textTransform: "uppercase",
  letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700
};
const actionBtn = (color) => ({
  color, fontSize: "15px", background: "none", border: "none", cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em"
});

export default function Returnables() {
  const [records, setRecords] = useState([]);
  const [editModal, setEditModal] = useState(null); // holds full record
  const [returnQty, setReturnQty] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => api.get("/returnables").then(r => setRecords(Array.isArray(r.data) ? r.data : []));

  useEffect(() => { load(); }, []);

  const totalOut = records.reduce((s, r) => s + parseInt(r.quantity_out || 0), 0);

  const openEdit = (rec) => { setEditModal(rec); setReturnQty(""); };

  const handleReturn = async () => {
    if (!returnQty || parseInt(returnQty) <= 0) return;
    if (loading) return;
    setLoading(true);
    try {
      await api.post(`/returnables/${editModal.id}/return`, { quantity_returned: parseInt(returnQty) });
      setEditModal(null);
      setReturnQty("");
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to record return");
    } finally {
      setLoading(false);
    }
  };

  const afterReturn = editModal ? Math.max(0, parseInt(editModal.quantity_out) - parseInt(returnQty || 0)) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Returnables</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>
            Bottles shops currently owe us
          </p>
        </div>
        {records.length > 0 && (
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "13px", color: "#888", fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Bottles Out</p>
            <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#C8102E", margin: 0 }}>
              {totalOut.toLocaleString()}B
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
          <thead className="table-head">
            <tr>
              {["Shop", "Owner", "Godown", "Product", "Bottles Out", "Last Updated", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="table-row">
                <td style={{ fontWeight: 600, fontSize: "16px", padding: "16px" }}>{r.shop_name}</td>
                <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>{r.shop_owner || <span style={{ color: "#ccc" }}>—</span>}</td>
                <td style={{ color: "#888", fontSize: "15px", padding: "16px" }}>{r.godown_name}</td>
                <td style={{ fontSize: "15px", padding: "16px", fontWeight: 500 }}>{r.product_name}</td>
                <td style={{ padding: "16px" }}>
                  <span style={{
                    fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 800, fontSize: "1.4rem",
                    color: "#C8102E"
                  }}>
                    {r.quantity_out}B
                  </span>
                </td>
                <td style={{ color: "#555", fontSize: "14px", padding: "16px" }}>
                  {new Date(r.updated_at).toLocaleDateString("en-IN")}
                </td>
                <td style={{ padding: "16px" }}>
                  <button onClick={() => openEdit(r)} style={actionBtn("#C8102E")}>Record Return</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {records.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", color: "#ccc", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              No outstanding returnables
            </p>
          </div>
        )}
      </div>

      {/* Record Return Modal */}
      {editModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: "400px" }}>
            <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "16px", marginBottom: "20px" }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Record Return
              </h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                {editModal.shop_name} · {editModal.product_name}
              </p>
            </div>

            {/* Current status */}
            <div style={{ marginBottom: "20px" }}>
              {[
                { label: "Shop", value: editModal.shop_name },
                { label: "Product", value: editModal.product_name },
                { label: "Currently Out", value: `${editModal.quantity_out} Bottles`, color: "#C8102E" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={labelStyle}>{row.label}</span>
                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem", color: row.color || "#111" }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>Bottles Returned Now</label>
              <input
                type="number"
                className="input"
                style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700 }}
                value={returnQty}
                onChange={e => setReturnQty(e.target.value)}
                placeholder="0"
                min="1"
                max={editModal.quantity_out}
                autoFocus
              />
            </div>

            {returnQty !== "" && parseInt(returnQty) > 0 && (
              <div style={{ background: "#f8f8f8", borderLeft: "4px solid #111", padding: "14px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={labelStyle}>Still Owed After</span>
                  <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: "1.2rem", color: afterReturn > 0 ? "#C8102E" : "#16a34a" }}>
                    {afterReturn}B
                  </span>
                </div>
                {afterReturn === 0 && (
                  <p style={{ fontSize: "13px", color: "#16a34a", marginTop: "8px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                    ✓ Fully returned — row will disappear
                  </p>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={handleReturn} className="btn-primary" style={{ flex: 1 }} disabled={loading || !returnQty || parseInt(returnQty) <= 0}>
                {loading ? "Saving..." : "Confirm Return"}
              </button>
              <button onClick={() => { setEditModal(null); setReturnQty(""); }} className="btn-outline" style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}