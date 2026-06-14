const express = require("express");
const router = express.Router();
const Pin = require("../models/Pin");
const Order = require("../models/Order");
const { sendPinSMS } = require("../services/sms");

// Card prices in GHS (change in .env or here)
const PRICES = {
  BECE: Number(process.env.BECE_PRICE) || 12,
  WASSCE: Number(process.env.WASSCE_PRICE) || 15,
};

/*
  USSD sessions use a text string that grows with each input.
  e.g. after two inputs: "1*0241234567"
  We split by "*" to get the menu level.

  Menu structure:
  Level 0 (no input yet) → Main menu
  Level 1 → User selects card type (1=BECE, 2=WASSCE)
  Level 2 → User enters their MoMo number
  Level 3 → Confirm purchase (1=Yes, 2=No)
  Level 4 → Process payment & send PIN via SMS
*/

router.post("/", async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  // Normalize phone: strip leading 0, add Ghana code
  const normalizedPhone = phoneNumber.startsWith("0")
    ? "+233" + phoneNumber.slice(1)
    : phoneNumber;

  const inputs = text ? text.split("*") : [];
  const level = inputs.length;

  let response = "";

  try {
    // ── Level 0: Main menu ──────────────────────────────────────
    if (text === "") {
      response =
        `CON Welcome to WaecSell\n` +
        `Buy your WAEC Result Checker PIN\n\n` +
        `1. BECE Card (GHS ${PRICES.BECE})\n` +
        `2. WASSCE Card (GHS ${PRICES.WASSCE})\n` +
        `0. Exit`;

    // ── Level 1: Card type selected ─────────────────────────────
    } else if (level === 1) {
      const choice = inputs[0];
      if (choice === "1" || choice === "2") {
        const type = choice === "1" ? "BECE" : "WASSCE";
        const price = PRICES[type];

        // Check stock before asking for payment
        const available = await Pin.countDocuments({ type, status: "available" });
        if (available === 0) {
          response = `END Sorry, ${type} cards are out of stock.\nPlease try again later.`;
        } else {
          response =
            `CON ${type} Card - GHS ${price}\n\n` +
            `Enter your MoMo number to pay:\n` +
            `(e.g. 0241234567)`;
        }
      } else if (choice === "0") {
        response = "END Thank you for using WaecSell. Goodbye!";
      } else {
        response = "END Invalid option. Please try again.";
      }

    // ── Level 2: MoMo number entered ────────────────────────────
    } else if (level === 2) {
      const momoNumber = inputs[1];
      const cardChoice = inputs[0];
      const type = cardChoice === "1" ? "BECE" : "WASSCE";
      const price = PRICES[type];

      // Basic phone number validation
      const phoneRegex = /^0[235][0-9]{8}$/;
      if (!phoneRegex.test(momoNumber)) {
        response = "END Invalid MoMo number. Please try again with a valid Ghana number.";
      } else {
        response =
          `CON Confirm Purchase\n\n` +
          `Card: ${type}\n` +
          `Amount: GHS ${price}\n` +
          `MoMo: ${momoNumber}\n\n` +
          `1. Confirm & Pay\n` +
          `2. Cancel`;
      }

    // ── Level 3: Confirm purchase ────────────────────────────────
    } else if (level === 3) {
      const confirm = inputs[2];
      const cardChoice = inputs[0];
      const momoNumber = inputs[1];
      const type = cardChoice === "1" ? "BECE" : "WASSCE";
      const price = PRICES[type];

      if (confirm === "2") {
        response = "END Purchase cancelled. Thank you!";

      } else if (confirm === "1") {
        // ── Process the purchase ─────────────────────────────────

        // 1. Find and lock an available PIN atomically
        const pin = await Pin.findOneAndUpdate(
          { type, status: "available" },
          { status: "sold", soldTo: normalizedPhone, soldAt: new Date() },
          { new: true }
        );

        if (!pin) {
          response = `END Sorry, ${type} cards just ran out. Please try again later.`;
        } else {
          // 2. Save order to database
          const order = await Order.create({
            phone: normalizedPhone,
            pin: pin._id,
            pinCode: pin.code,
            cardType: type,
            amount: price,
            paymentStatus: "paid", // In production: verify via Paystack webhook first
          });

          // 3. Send SMS with PIN
          const smsResult = await sendPinSMS(normalizedPhone, pin.code, type);

          // 4. Update order with SMS status
          await Order.findByIdAndUpdate(order._id, {
            smsSent: smsResult.success,
            smsStatus: smsResult.success ? "delivered" : "failed",
          });

          if (smsResult.success) {
            response =
              `END Payment successful!\n\n` +
              `Your ${type} PIN has been sent to ${momoNumber} via SMS.\n` +
              `Check your messages now.`;
          } else {
            // SMS failed but PIN is sold — show PIN on screen as fallback
            response =
              `END Payment successful!\n\n` +
              `Your ${type} PIN: ${pin.code}\n\n` +
              `(SMS delivery failed. Please note this PIN.)`;
          }
        }
      } else {
        response = "END Invalid option. Please try again.";
      }

    } else {
      response = "END Session expired. Please dial again.";
    }

  } catch (err) {
    console.error("USSD error:", err);
    response = "END An error occurred. Please try again.";
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

module.exports = router;
