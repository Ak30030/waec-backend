const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const AdminUser = require("../models/AdminUser");
const { protect, superadminOnly } = require("../middleware/authAdmin");

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await AdminUser.findOne({ email });
    if (!admin || !(await admin.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({
      token: generateToken(admin._id),
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /auth/register — superadmin only (create new admins)
router.post("/register", protect, async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const exists = await AdminUser.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already registered" });

    const admin = await AdminUser.create({ name, email, password, role });
    res.status(201).json({
      message: "Admin created",
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /auth/me
router.get("/me", protect, (req, res) => {
  res.json(req.admin);
});

module.exports = router;
