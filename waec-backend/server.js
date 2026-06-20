require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const ussdRoutes = require("./routes/ussd");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const pinRoutes = require("./routes/pins");
const orderRoutes = require("./routes/orders");
const settingsRoutes = require("./routes/settings");

const app = express();

// Connect to MongoDB
connectDB();


// Middleware
app.use(cors({
    origin:'*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/ussd", ussdRoutes);
app.use("/auth", authRoutes);
app.use("/admin/pins", pinRoutes);
app.use("/admin/orders", orderRoutes);
app.use("/admin/settings", settingsRoutes);
app.use("/admin", adminRoutes);

// Health check
app.get("/", (req, res) => res.json({ status: "WAEC USSD Backend running" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));