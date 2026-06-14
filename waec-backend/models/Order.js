const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    pin: { type: mongoose.Schema.Types.ObjectId, ref: "Pin", required: true },
    pinCode: { type: String, required: true },   // store plaintext for SMS resend
    cardType: { type: String, enum: ["BECE", "WASSCE"], required: true },
    amount: { type: Number, required: true },
    paystackReference: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    smsSent: { type: Boolean, default: false },
    smsStatus: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
