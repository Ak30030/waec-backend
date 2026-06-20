// models/Settings.js
const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "prices", unique: true },
    BECE: { type: Number, required: true, default: 12 },
    WASSCE_SCHOOL: { type: Number, required: true, default: 15 },
    WASSCE_PRIVATE: { type: Number, required: true, default: 15 },
    bulkContactNumber: { type: String, default: "0244131805" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", SettingsSchema);