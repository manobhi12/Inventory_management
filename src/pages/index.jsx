/* eslint-disable react-hooks/exhaustive-deps */
 
import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7days", label: "Past 7 Days" },
  { key: "30days", label: "Past 30 Days" },
  { key: "all", label: "All Time" },
];

function StatCard({ label, value, color = "#111111", sub }) {
  return (
    <div className="card">
      <p style={{ fontSize: "13px", color: "#111", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{label}</p>
      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem", fontWeight: 700, color }}>{value}</p>
      {sub && <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState("today");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [spinning, setSpinning] = useState(false);

  const load = useCallback((r = range) => {
    setSpinning(true);
    api.get(`/reports/dashboard?range=${r}`).then(res => {
      setStats(res.data);
      setLastUpdated(new Date());
    }).finally(() => setSpinning(false));
  }, [range]);

  useEffect(() => {
    load(range);
    const interval = setInterval(() => load(range), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const fmt = (val) => `₹${Number(val || 0).toLocaleString()}`;

  const labelStyle = {
    fontSize: "13px",
    color: "#111",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 600,
    marginBottom: "12px"
  };

  return (
    <div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", marginTop: "20px" }}>
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p style={{ fontSize: "15px", color: "#888", marginTop: "4px" }}>
            Live overview of your godown
          </p>
        </div>
        <button
          onClick={() => load(range)}
          className="btn-outline"
          style={{ fontSize: "12px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <span style={{
            display: "inline-block",
            animation: spinning ? "spin 0.7s linear infinite" : "none",
            fontSize: "16px"
          }}>
            ↻
          </span>
          Refresh
        </button>
      </div>

      {/* Range Selector */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            style={{
              padding: "8px 20px",
              borderRadius: "4px",
              border: "2px solid",
              borderColor: range === r.key ? "#C8102E" : "#e0e0e0",
              background: range === r.key ? "#C8102E" : "white",
              color: range === r.key ? "white" : "#555",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "14px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: "pointer",
              transition: "all 0.15s"
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {!stats ? (
        <div style={{ color: "#9ca3af", fontSize: "14px" }}>Loading...</div>
      ) : (
        <>
          {/* Sales */}
          <p style={labelStyle}>Sales</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <StatCard
              label="Total Sales"
              value={fmt(stats.total_sales)}
              color="#16a34a"
              sub={`Shop: ${fmt(stats.shop_sales)} | Counter: ${fmt(stats.counter_sales)}`}
            />
            <StatCard
              label="Delivery Sales"
              value={fmt(stats.shop_sales)}
              color="#16a34a"
            />
            <StatCard
              label="Counter Sales"
              value={fmt(stats.counter_sales)}
              color="#2563eb"
            />
          </div>

          {/* Purchases & Inventory */}
          <p style={labelStyle}>Purchases & Inventory</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <StatCard
              label="Purchases"
              value={fmt(stats.purchases)}
              color="#d97706"
            />
            <StatCard
              label="Inventory Stock Value"
              value={fmt(stats.stock_value)}
              color="#C8102E"
            />
            <StatCard
              label="Company Pending"
              value={fmt(stats.pending_purchases)}
              color="#d97706"
            />
          </div>

          {/* Cash */}
          <p style={labelStyle}>Cash</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <StatCard
              label="Cash in Hand"
              value={fmt(stats.cash_in_hand)}
              color="#C8102E"
            />
            <StatCard
              label="Cash in Bank"
              value={fmt(stats.cash_in_bank)}
              color="#16a34a"
            />
            <StatCard
              label="Pending Bill Payments"
              value={fmt(stats.pending_bills)}
              color="#dc2626"
            />
          </div>

          {/* Expenses */}
          <p style={labelStyle}>Expenses</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <StatCard
              label="Total Expenses"
              value={fmt(stats.total_expenses)}
              color="#111111"
            />
            <StatCard
              label="Free Products Given"
              value={fmt(stats.free_products_value)}
              color="#7c3aed"
              sub="At selling price"
            />
          </div>

          {/* Footer */}
          <div className="card">
            <p style={{ fontSize: "12px", color: "#9ca3af" }}>
              Auto-refreshes every 30 seconds &nbsp;|&nbsp;
              Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString("en-IN") : "—"} &nbsp;|&nbsp;
              Showing: <strong>{RANGES.find(r => r.key === range)?.label}</strong>
              {range !== "today" && range !== "all" && " — Stock value & pending amounts are always all-time"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}