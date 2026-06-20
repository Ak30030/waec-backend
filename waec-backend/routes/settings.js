// routes/settings.js
const express = require("express");
const router = express.Router();
const Settings = require("../models/Settings");
const { protect, superadminOnly } = require("../middleware/authAdmin");

// GET /admin/settings — anyone logged in can view
router.get("/", protect, async (req, res) => {
  try {
    let settings = await Settings.findOne({ key: "prices" });
    if (!settings) {
      settings = await Settings.create({ key: "prices" }); // creates with defaults
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /admin/settings — superadmin only
router.put("/", protect, async (req, res) => {
  try {
    const { BECE, WASSCE_SCHOOL, WASSCE_PRIVATE, bulkContactNumber } = req.body;

    const settings = await Settings.findOneAndUpdate(
      { key: "prices" },
      {
        ...(BECE !== undefined && { BECE }),
        ...(WASSCE_SCHOOL !== undefined && { WASSCE_SCHOOL }),
        ...(WASSCE_PRIVATE !== undefined && { WASSCE_PRIVATE }),
        ...(bulkContactNumber !== undefined && { bulkContactNumber }),
      },
      { new: true, upsert: true }
    );

    res.json({ message: "Settings updated", settings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;