require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const ussdRoutes = require("./routes/ussd");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const pinRoutes = require("./routes/pins");
const orderRoutes = require("./routes/orders");

const app = express();

// Connect to MongoDB
connectDB();

// CORS — must be before everything else
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://your-admin-panel.vercel.app",
  ],
  credentials: true,
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/ussd", ussdRoutes);
app.use("/auth", authRoutes);
app.use("/admin/pins", pinRoutes);
app.use("/admin/orders", orderRoutes);
app.use("/admin", adminRoutes);

// Health check
app.get("/", (req, res) => res.json({ status: "WAEC USSD Backend running" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));