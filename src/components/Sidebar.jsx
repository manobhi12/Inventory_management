// ...existing code...
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

const allLinks = [
  { to: "/bills", label: "Bills" },
  { to: "/breakage", label: "Breakage" },
  { to: "/cash-flow", label: "Cash Flow" },
  { to: "/companies", label: "Companies" },
  { to: "/counter-sales", label: "Counter Sales" },
  { to: "/", label: "Dashboard" },
  { to: "/drivers", label: "Drivers" },
  { to: "/expenses", label: "Expenses" },
  { to: "/free-products", label: "Free Products" },
  { to: "/inventory", label: "Inventory" },
  { to: "/onlinetransactions", label: "OnlineTransactions" },
  { to: "/products", label: "Products" },
  { to: "/purchases", label: "Purchases" },
  { to: "/reports", label: "Reports" },
  { to: "/routes", label: "Routes" },
  { to: "/shops", label: "Shops" },
];

export default function Sidebar() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <div style={{
      width: "220px",
      background: "#111111",
      height: "100vh",         // changed from minHeight to exact viewport height
      position: "fixed",
      left: 0, top: 0, bottom: 0, // ensure it spans full height
      display: "flex",
      flexDirection: "column",
      zIndex: 20,
      borderRight: "4px solid #C8102E",
      overflow: "hidden"       // prevent double scroll; nav will handle scrolling
    }}>
      {/* Logo */}
      <div style={{ padding: "28px 24px 20px", borderBottom: "1px solid #1f1f1f" }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: "2rem",
          fontWeight: 800,
          color: "white",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          lineHeight: 1
        }}>
          <span style={{ color: "#C8102E" }}>INV</span>
          <span>ENTORY</span>
        </div>
        <div style={{
          marginTop: "8px",
          background: "#C8102E",
          display: "inline-block",
          padding: "2px 8px"
        }}>
          <p style={{
            color: "white",
            fontSize: "10px",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em"
          }}>
            {user?.role === "admin" ? "Admin" : user?.username}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: "1 1 auto",        // take remaining space
        paddingTop: "12px",
        paddingBottom: "16px",   // space so last item isn't hidden behind footer
        overflowY: "auto",       // enable vertical scrolling
        WebkitOverflowScrolling: "touch" // smooth scrolling on iOS
      }}>
        {allLinks.map(link => {
          const isActive = router.pathname === link.to;
          return (
            <Link
              key={link.to}
              href={link.to}
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "11px 24px",
                fontSize: "16px",
                textDecoration: "none",
                transition: "all 0.1s",
                background: isActive ? "#C8102E" : "transparent",
                color: isActive ? "white" : "#c0c0c0",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                borderLeft: isActive ? "4px solid white" : "4px solid transparent",
                boxSizing: "border-box",
                width: "100%"
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid #1f1f1f", background: "#0f0f0f" }}>
        <p style={{
          color: "#333",
          fontSize: "10px",
          fontFamily: "'Barlow Condensed', sans-serif",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          margin: 0
        }}>
          © 2026 Inventory
        </p>
      </div>
    </div>
  );
}
// ...existing code...