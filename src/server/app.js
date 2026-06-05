const express = require("express");
const cors = require("cors");
const compression = require("compression");

const app = express();

app.use(compression());
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/godowns", require("./routes/godowns"));
app.use("/api/products", require("./routes/products"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/shops", require("./routes/shops"));
app.use("/api/routes", require("./routes/routes"));
app.use("/api/inventory", require("./routes/inventory"));
app.use("/api/purchases", require("./routes/purchases"));
app.use("/api/bills", require("./routes/bills"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/free-products", require("./routes/freeProducts"));
app.use("/api/counter-sales", require("./routes/counterSales"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/breakage", require("./routes/breakage"));
app.use("/api/bank-transactions", require("./routes/bankTransactions"));
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/online-transactions", require("./routes/onlineTransactions"));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/returnables', require('./routes/returnables'));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
