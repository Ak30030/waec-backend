const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { protect } = require("../middleware/authAdmin");
const { sendPinSMS } = require("../services/sms");

router.use(protect);

// GET /admin/orders — list all orders with filters
router.get("/", async (req, res) => {
  try {
    const { cardType, paymentStatus, page = 1, limit = 50, startDate, endDate } = req.query;
    const filter = {};

    if (cardType) filter.cardType = cardType;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate("pin", "code type")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ total, page: Number(page), orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /admin/orders/stats — dashboard summary numbers
router.get("/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalSales, todaySales, totalRevenue, todayRevenue, smsFailures] =
      await Promise.all([
        Order.countDocuments({ paymentStatus: "paid" }),
        Order.countDocuments({ paymentStatus: "paid", createdAt: { $gte: today } }),
        Order.aggregate([
          { $match: { paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Order.aggregate([
          { $match: { paymentStatus: "paid", createdAt: { $gte: today } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Order.countDocuments({ smsSent: false, paymentStatus: "paid" }),
      ]);

    res.json({
      totalSales,
      todaySales,
      totalRevenue: totalRevenue[0]?.total || 0,
      todayRevenue: todayRevenue[0]?.total || 0,
      smsFailures,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /admin/orders/:id/resend-sms — resend PIN SMS for a failed delivery
router.post("/:id/resend-sms", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const result = await sendPinSMS(order.phone, order.pinCode, order.cardType);
    await Order.findByIdAndUpdate(order._id, {
      smsSent: result.success,
      smsStatus: result.success ? "delivered" : "failed",
    });

    res.json({ success: result.success, message: result.success ? "SMS resent" : "SMS failed again" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
