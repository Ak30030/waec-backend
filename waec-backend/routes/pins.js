const express = require("express");
const router = express.Router();
const Pin = require("../models/Pin");
const { protect } = require("../middleware/authAdmin");

// All pin routes require login
router.use(protect);

// GET /admin/pins — list all pins with filters
router.get("/", async (req, res) => {
  try {
    const { type, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const total = await Pin.countDocuments(filter);
    const pins = await Pin.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ total, page: Number(page), pins });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /admin/pins/summary — stock count by type
router.get("/summary", async (req, res) => {
  try {
    const summary = await Pin.aggregate([
      { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
    ]);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /admin/pins/bulk — upload pins from JSON array
// Body: { pins: [{ code: "1234-5678-9012", type: "BECE" }, ...] }
router.post("/bulk", async (req, res) => {
  try {
    const { pins } = req.body;
    if (!Array.isArray(pins) || pins.length === 0) {
      return res.status(400).json({ message: "Provide an array of pins" });
    }

    // insertMany with ordered:false skips duplicates instead of stopping
    const result = await Pin.insertMany(pins, { ordered: false }).catch((err) => {
      // Return partial success info if some were duplicates
      if (err.code === 11000) return { insertedCount: err.result?.nInserted || 0 };
      throw err;
    });

    res.status(201).json({
      message: "PINs uploaded",
      inserted: result.insertedCount ?? result.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /admin/pins/:id — any logged-in admin
router.delete("/:id", async (req, res) => {
  try {
    const pin = await Pin.findById(req.params.id);
    if (!pin) return res.status(404).json({ message: "PIN not found" });
    if (pin.status === "sold")
      return res.status(400).json({ message: "Cannot delete a sold PIN" });

    await pin.deleteOne();
    res.json({ message: "PIN deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;