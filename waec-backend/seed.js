// seed.js
import "dotenv/config";
import mongoose from "mongoose";
import AdminUser from "./models/AdminUser.js";

await mongoose.connect(process.env.MONGO_URI);

const exists = await AdminUser.findOne({ email: "fred@yourdomain.com" });
if (exists) {
  console.log("Superadmin already exists");
  process.exit();
}

await AdminUser.create({
  name: "Fred",
  email: "fred@yourdomain.com",
  password: "YourSecurePassword123",
  role: "superadmin",
});

console.log("Superadmin created successfully");
process.exit();