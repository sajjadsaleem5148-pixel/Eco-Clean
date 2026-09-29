const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const connectDB = require("./config/db");

// Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const pickupRoutes = require("./routes/pickupRoutes");
const complaintRoutes = require("./routes/complaintRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");
const collectorRoutes = require("./routes/collectorRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");
// Load environment variables


const app = express();

// ===============================
// DATABASE CONNECTION
// ===============================

connectDB();

// ===============================
// MIDDLEWARE
// ===============================

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// UPLOADS
// ===============================

// Uploaded images ko browser se access karne ke liye
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// ===============================
// TEST ROUTE
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "EcoClean Backend API is running 🚀",
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "EcoClean API is healthy",
  });
});

// ===============================
// API ROUTES
// ===============================

app.use("/api/auth", authRoutes);

app.use("/api/users", userRoutes);

app.use("/api/pickups", pickupRoutes);

app.use("/api/complaints", complaintRoutes);

app.use("/api/schedules", scheduleRoutes);

app.use("/api/collectors", collectorRoutes);

app.use("/api/notifications", notificationRoutes);

app.use("/api/admin", adminRoutes);

// ===============================
// 404 ROUTE
// ===============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// ===============================
// ERROR HANDLER
// ===============================

app.use((error, req, res, next) => {
  console.error("Server Error:", error.message);

  res.status(500).json({
    success: false,
    message: error.message || "Internal Server Error",
  });
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`EcoClean Backend running on http://localhost:${PORT}`);
});