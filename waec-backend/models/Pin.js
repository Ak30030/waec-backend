const mongoose = require("mongoose");
const PinSchema = new mongoose.Schema(
  {
    serial: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["BECE", "WASSCE_SCHOOL", "WASSCE_PRIVATE"], required: true },
    status: { type: String, enum: ["available", "sold"], default: "available" },
    soldTo: { type: String, default: null },
    soldAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pin", PinSchema);
