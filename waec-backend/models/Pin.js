const mongoose = require("mongoose");

const PinSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["BECE", "WASSCE"], required: true },
    status: {
      type: String,
      enum: ["available", "sold"],
      default: "available",
    },
    soldTo: { type: String, default: null },   // phone number
    soldAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pin", PinSchema);
