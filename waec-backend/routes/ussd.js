const express = require("express");
const router = express.Router();
const Pin = require("../models/Pin");
const Order = require("../models/Order");
const { sendPinSMS } = require("../services/sms");

const PRICES = {
  WASSCE_SCHOOL: Number(process.env.WASSCE_SCHOOL_PRICE) || 15,
  WASSCE_PRIVATE: Number(process.env.WASSCE_PRIVATE_PRICE) || 15,
  BECE: Number(process.env.BECE_PRICE) || 12,
};

// Helper: pick multiple available PINs atomically
const pickPins = async (type, quantity) => {
  const pins = [];
  for (let i = 0; i < quantity; i++) {
    const pin = await Pin.findOneAndUpdate(
      { type, status: "available" },
      { status: "sold", soldAt: new Date() },
      { new: true }
    );
    if (!pin) break;
    pins.push(pin);
  }
  return pins;
};

// Helper: check stock
const checkStock = async (type, qty) => {
  const count = await Pin.countDocuments({ type, status: "available" });
  return count >= qty;
};

// Helper: build pin list string with serial and PIN
const buildPinList = (pins) =>
  pins.map((p, i) =>
    `Voucher ${i + 1}:\nSerial: ${p.serial || "N/A"}\nPIN: ${p.code}`
  ).join("\n\n");

// Helper: save orders for purchased pins
const saveOrders = async (pins, phone, type, price) => {
  for (const pin of pins) {
    await Order.create({
      phone,
      pin: pin._id,
      pinCode: pin.code,
      serial: pin.serial || null,
      cardType: type,
      amount: price,
      paymentStatus: "paid",
    });
    pin.soldTo = phone;
    await pin.save();
  }
};

router.post("/", async (req, res) => {
  const { phoneNumber, text } = req.body;

  const normalizedPhone = phoneNumber.startsWith("0")
    ? "+233" + phoneNumber.slice(1)
    : phoneNumber.startsWith("+233")
    ? phoneNumber
    : "+233" + phoneNumber;

  const inputs = text ? text.split("*") : [];
  let response = "";

  try {

    // ── MAIN MENU ───────────────────────────────────────────────
    if (text === "") {
      response =
        `CON Welcome to WaecSell\n` +
        `Buy your Result Checker Voucher\n\n` +
        `1. WASSCE Checker\n` +
        `2. BECE Checker\n` +
        `3. Buy in Bulk\n` +
        `4. Retrieve Voucher\n` +
        `0. Exit`;

    // ── EXIT ────────────────────────────────────────────────────
    } else if (text === "0") {
      response = "END Thank you for using WaecSell. Goodbye!";

    // ══════════════════════════════════════════════════════════════
    // OPTION 1 — WASSCE CHECKER
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "1") {

      // 1 → WASSCE type selection
      if (inputs.length === 1) {
        response =
          `CON WASSCE Checker\n` +
          `Select checker type:\n\n` +
          `1. School Candidate\n` +
          `2. Private Candidate\n` +
          `0. Back`;

      // 1*0 → back to main menu
      } else if (inputs[1] === "0") {
        response =
          `CON Welcome to WaecSell\n` +
          `Buy your Result Checker Voucher\n\n` +
          `1. WASSCE Checker\n` +
          `2. BECE Checker\n` +
          `3. Buy in Bulk\n` +
          `4. Retrieve Voucher\n` +
          `0. Exit`;

      // 1*1 or 1*2 → quantity
      } else if (inputs.length === 2 && (inputs[1] === "1" || inputs[1] === "2")) {
        const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
        const label = inputs[1] === "1" ? "School" : "Private";
        response =
          `CON WASSCE ${label} Checker\n` +
          `Price: GHS ${PRICES[type]} each\n\n` +
          `Enter quantity (1-5):`;

      // 1*1*qty → enter MoMo number
      } else if (inputs.length === 3) {
        const qty = parseInt(inputs[2]);
        if (isNaN(qty) || qty < 1 || qty > 5) {
          response = "END Invalid quantity. Please enter a number between 1 and 5.";
        } else {
          const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
          const total = PRICES[type] * qty;
          response =
            `CON Enter your MoMo number to pay:\n` +
            `Total: GHS ${total} for ${qty} voucher(s)\n\n` +
            `(e.g. 0241234567)`;
        }

      // 1*1*qty*phone → confirm
      } else if (inputs.length === 4) {
        const qty = parseInt(inputs[2]);
        const momoNumber = inputs[3];
        const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
        const label = inputs[1] === "1" ? "School" : "Private";
        const total = PRICES[type] * qty;
        const phoneRegex = /^0[235][0-9]{8}$/;

        if (!phoneRegex.test(momoNumber)) {
          response = "END Invalid MoMo number. Please try again with a valid Ghana number.";
        } else {
          response =
            `CON Confirm Purchase\n\n` +
            `Type: WASSCE ${label}\n` +
            `Quantity: ${qty}\n` +
            `Amount: GHS ${total}\n` +
            `MoMo: ${momoNumber}\n\n` +
            `1. Confirm & Pay\n` +
            `2. Cancel`;
        }

      // 1*1*qty*phone*1 → process payment
      } else if (inputs.length === 5) {
        if (inputs[4] === "2") {
          response = "END Purchase cancelled. Thank you!";
        } else if (inputs[4] === "1") {
          const qty = parseInt(inputs[2]);
          const momoNumber = inputs[3];
          const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
          const label = inputs[1] === "1" ? "School" : "Private";

          const hasStock = await checkStock(type, qty);
          if (!hasStock) {
            response = `END Sorry, not enough WASSCE ${label} vouchers in stock.\nPlease try a smaller quantity or check back later.`;
          } else {
            const pins = await pickPins(type, qty);
            if (pins.length < qty) {
              response = "END Sorry, stock ran out during your purchase. Please try again.";
            } else {
              await saveOrders(pins, normalizedPhone, type, PRICES[type]);
              const pinList = buildPinList(pins);
              await sendPinSMS(normalizedPhone, pinList, `WASSCE ${label}`);
              response =
                `END Payment successful!\n` +
                `Your ${qty} WASSCE ${label} PIN(s)\n` +
                `have been sent to ${momoNumber} via SMS.\n` +
                `Check your messages now.`;
            }
          }
        } else {
          response = "END Invalid option. Please try again.";
        }
      }

    // ══════════════════════════════════════════════════════════════
    // OPTION 2 — BECE CHECKER
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "2") {

      // 2 → quantity
      if (inputs.length === 1) {
        response =
          `CON BECE Checker\n` +
          `Price: GHS ${PRICES.BECE} each\n\n` +
          `Enter quantity (1-5):`;

      // 2*qty → MoMo number
      } else if (inputs.length === 2) {
        const qty = parseInt(inputs[1]);
        if (isNaN(qty) || qty < 1 || qty > 5) {
          response = "END Invalid quantity. Please enter a number between 1 and 5.";
        } else {
          const total = PRICES.BECE * qty;
          response =
            `CON Enter your MoMo number to pay:\n` +
            `Total: GHS ${total} for ${qty} voucher(s)\n\n` +
            `(e.g. 0241234567)`;
        }

      // 2*qty*phone → confirm
      } else if (inputs.length === 3) {
        const qty = parseInt(inputs[1]);
        const momoNumber = inputs[2];
        const total = PRICES.BECE * qty;
        const phoneRegex = /^0[235][0-9]{8}$/;

        if (!phoneRegex.test(momoNumber)) {
          response = "END Invalid MoMo number. Please try again.";
        } else {
          response =
            `CON Confirm Purchase\n\n` +
            `Type: BECE\n` +
            `Quantity: ${qty}\n` +
            `Amount: GHS ${total}\n` +
            `MoMo: ${momoNumber}\n\n` +
            `1. Confirm & Pay\n` +
            `2. Cancel`;
        }

      // 2*qty*phone*1 → process
      } else if (inputs.length === 4) {
        if (inputs[3] === "2") {
          response = "END Purchase cancelled. Thank you!";
        } else if (inputs[3] === "1") {
          const qty = parseInt(inputs[1]);
          const momoNumber = inputs[2];

          const hasStock = await checkStock("BECE", qty);
          if (!hasStock) {
            response = "END Sorry, not enough BECE vouchers in stock.\nPlease try a smaller quantity or check back later.";
          } else {
            const pins = await pickPins("BECE", qty);
            if (pins.length < qty) {
              response = "END Sorry, stock ran out during your purchase. Please try again.";
            } else {
              await saveOrders(pins, normalizedPhone, "BECE", PRICES.BECE);
              const pinList = buildPinList(pins);
              await sendPinSMS(normalizedPhone, pinList, "BECE");
              response =
                `END Payment successful!\n` +
                `Your ${qty} BECE PIN(s) have been\n` +
                `sent to ${momoNumber} via SMS.\n` +
                `Check your messages now.`;
            }
          }
        } else {
          response = "END Invalid option. Please try again.";
        }
      }

    // ══════════════════════════════════════════════════════════════
    // OPTION 3 — BUY IN BULK (contact only)
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "3") {
      response =
        `END For bulk purchases please\n` +
        `contact us on:\n` +
        `0244131805\n\n` +
        `We will get back to you shortly.`;

    // ══════════════════════════════════════════════════════════════
    // OPTION 4 — RETRIEVE VOUCHER
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "4") {

      // 4 → ask for phone number
      if (inputs.length === 1) {
        response =
          `CON Retrieve Your Voucher\n\n` +
          `Enter the phone number used\n` +
          `during purchase:\n` +
          `(e.g. 0241234567)`;

      // 4*phone → find and resend PINs
      } else if (inputs.length === 2) {
        const momoNumber = inputs[1];
        const phoneRegex = /^0[235][0-9]{8}$/;

        if (!phoneRegex.test(momoNumber)) {
          response = "END Invalid phone number. Please try again.";
        } else {
          const formattedSearch = "+233" + momoNumber.slice(1);

          const orders = await Order.find({ phone: formattedSearch, paymentStatus: "paid" })
            .sort({ createdAt: -1 })
            .limit(5);

          if (orders.length === 0) {
            response =
              `END No vouchers found for\n${momoNumber}.\n\n` +
              `Please check the number and try again.`;
          } else {
            // fixed
const pinList = orders.map((o, i) =>
  `Voucher ${i + 1}:\nType: ${o.cardType}\nSerial: ${o.serial || "N/A"}\nPIN: ${o.pinCode}`
).join("\n\n");
            await sendPinSMS(formattedSearch, pinList, "Retrieved");
            response =
              `END Your voucher(s) have been\n` +
              `resent to ${momoNumber} via SMS.\n` +
              `Check your messages now.`;
          }
        }
      }

    } else {
      response = "END Invalid option. Please try again.";
    }

  } catch (err) {
    console.error("USSD error:", err);
    response = "END An error occurred. Please try again.";
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

module.exports = router;