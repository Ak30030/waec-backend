const express = require("express");
const router = express.Router();
const AdminUser = require("../models/AdminUser");
const { protect, superadminOnly } = require("../middleware/authAdmin");

router.use(protect);

// GET /admin/users — list all admins (superadmin only)
router.get("/users",  async (req, res) => {
  try {
    const users = await AdminUser.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /admin/users/:id — superadmin only
router.delete("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.admin._id.toString()) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }
    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ message: "Admin user deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
