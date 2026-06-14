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

/*
  MENU STRUCTURE:
  Level 0 → Main menu (WASSCE, BECE, Bulk, Retrieve)
  
  WASSCE path:
  1 → WASSCE type (1=School, 2=Private)
  1*1 or 1*2 → Enter quantity (1-5)
  1*1*qty → Enter MoMo number
  1*1*qty*phone → Confirm
  1*1*qty*phone*1 → Process

  BECE path:
  2 → Enter quantity (1-5)
  2*qty → Enter MoMo number
  2*qty*phone → Confirm
  2*qty*phone*1 → Process

  Bulk path:
  3 → Choose type (1=WASSCE School, 2=WASSCE Private, 3=BECE)
  3*type → Enter quantity (up to 5)
  3*type*qty → Enter MoMo number
  3*type*qty*phone → Confirm
  3*type*qty*phone*1 → Process

  Retrieve path:
  4 → Enter phone number
  4*phone → Show last PIN sent to that number
*/

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

router.post("/", async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;

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
          `1. wassce Candidate\n` +
          `2. Private Candidate\n` +
          `0. Back`;

      // 1*1 or 1*2 → quantity
      } else if (inputs.length === 2 && (inputs[1] === "1" || inputs[1] === "2")) {
        const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
        const label = inputs[1] === "1" ? "School" : "Private";
        response =
          `CON WASSCE ${label} Checker\n` +
          `Price: GHS ${PRICES[type]} each\n\n` +
          `Enter quantity (1-5):`;

      } else if (inputs[1] === "0") {
        response =
          `CON Welcome to WaecSell\n` +
          `Buy your Result Checker Voucher\n\n` +
          `1. WASSCE Checker\n` +
          `2. BECE Checker\n` +
          `3. Buy in Bulk\n` +
          `4. Retrieve Voucher\n` +
          `0. Exit`;

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
          const total = PRICES[type] * qty;

          const hasStock = await checkStock(type, qty);
          if (!hasStock) {
            response = `END Sorry, not enough WASSCE ${label} vouchers in stock.\nPlease try a smaller quantity or check back later.`;
          } else {
            const pins = await pickPins(type, qty);
            if (pins.length < qty) {
              response = "END Sorry, stock ran out during your purchase. Please try again.";
            } else {
              // Save orders and send SMS
              for (const pin of pins) {
                await Order.create({
                  phone: normalizedPhone,
                  pin: pin._id,
                  pinCode: pin.code,
                  cardType: type,
                  amount: PRICES[type],
                  paymentStatus: "paid",
                });
                pin.soldTo = normalizedPhone;
                await pin.save();
              }

              const pinList = pins.map((p, i) => 
  `Voucher ${i + 1}:\nSerial: ${p.serial}\nPIN: ${p.code}`
).join("\n\n");
              response =
                `END Payment successful!\n` +
                `Your ${qty} WASSCE ${label} PIN(s) have been\n` +
                `sent to ${momoNumber} via SMS.\n` +
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
          const total = PRICES.BECE * qty;

          const hasStock = await checkStock("BECE", qty);
          if (!hasStock) {
            response = "END Sorry, not enough BECE vouchers in stock.\nPlease try a smaller quantity or check back later.";
          } else {
            const pins = await pickPins("BECE", qty);
            if (pins.length < qty) {
              response = "END Sorry, stock ran out during your purchase. Please try again.";
            } else {
              for (const pin of pins) {
                await Order.create({
                  phone: normalizedPhone,
                  pin: pin._id,
                  pinCode: pin.code,
                  cardType: "BECE",
                  amount: PRICES.BECE,
                  paymentStatus: "paid",
                });
                pin.soldTo = normalizedPhone;
                await pin.save();
              }

              const pinList = pins.map((p, i) => `PIN ${i + 1}: ${p.code}`).join("\n");
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
    // OPTION 3 — BUY IN BULK
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "3") {
      if (inputs.length === 1) {
        response =
          `END For bulk purchases please\n` +
          `contact us on:\n` +
          `0244131805\n\n` +  // replace with your real number
          `We will get back to you shortly.`;

      // 3*type → quantity
      } else if (inputs.length === 2 && ["1","2","3"].includes(inputs[1])) {
        const typeMap = { "1": "WASSCE_SCHOOL", "2": "WASSCE_PRIVATE", "3": "BECE" };
        const labelMap = { "1": "WASSCE School", "2": "WASSCE Private", "3": "BECE" };
        const type = typeMap[inputs[1]];
        const label = labelMap[inputs[1]];
        response =
          `CON ${label} Bulk Purchase\n` +
          `Price: GHS ${PRICES[type]} each\n\n` +
          `Enter quantity (1-5):`;

      } else if (inputs[1] === "0") {
        response =
          `CON Welcome to WaecSell\n\n` +
          `1. WASSCE Checker\n` +
          `2. BECE Checker\n` +
          `3. Buy in Bulk\n` +
          `4. Retrieve Voucher\n` +
          `0. Exit`;

      // 3*type*qty → MoMo number
      } else if (inputs.length === 3) {
        const qty = parseInt(inputs[2]);
        const typeMap = { "1": "WASSCE_SCHOOL", "2": "WASSCE_PRIVATE", "3": "BECE" };
        const type = typeMap[inputs[1]];
        const total = PRICES[type] * qty;

        if (isNaN(qty) || qty < 1 || qty > 5) {
          response = "END Invalid quantity. Please enter a number between 1 and 5.";
        } else {
          response =
            `CON Enter your MoMo number to pay:\n` +
            `Total: GHS ${total} for ${qty} voucher(s)\n\n` +
            `(e.g. 0241234567)`;
        }

      // 3*type*qty*phone → confirm
      } else if (inputs.length === 4) {
        const typeMap = { "1": "WASSCE_SCHOOL", "2": "WASSCE_PRIVATE", "3": "BECE" };
        const labelMap = { "1": "WASSCE School", "2": "WASSCE Private", "3": "BECE" };
        const type = typeMap[inputs[1]];
        const label = labelMap[inputs[1]];
        const qty = parseInt(inputs[2]);
        const momoNumber = inputs[3];
        const total = PRICES[type] * qty;
        const phoneRegex = /^0[235][0-9]{8}$/;

        if (!phoneRegex.test(momoNumber)) {
          response = "END Invalid MoMo number. Please try again.";
        } else {
          response =
            `CON Confirm Bulk Purchase\n\n` +
            `Type: ${label}\n` +
            `Quantity: ${qty}\n` +
            `Amount: GHS ${total}\n` +
            `MoMo: ${momoNumber}\n\n` +
            `1. Confirm & Pay\n` +
            `2. Cancel`;
        }

      // 3*type*qty*phone*1 → process
      } else if (inputs.length === 5) {
        if (inputs[4] === "2") {
          response = "END Purchase cancelled. Thank you!";
        } else if (inputs[4] === "1") {
          const typeMap = { "1": "WASSCE_SCHOOL", "2": "WASSCE_PRIVATE", "3": "BECE" };
          const labelMap = { "1": "WASSCE School", "2": "WASSCE Private", "3": "BECE" };
          const type = typeMap[inputs[1]];
          const label = labelMap[inputs[1]];
          const qty = parseInt(inputs[2]);
          const momoNumber = inputs[3];

          const hasStock = await checkStock(type, qty);
          if (!hasStock) {
            response = `END Sorry, not enough ${label} vouchers in stock.`;
          } else {
            const pins = await pickPins(type, qty);
            if (pins.length < qty) {
              response = "END Sorry, stock ran out during your purchase. Please try again.";
            } else {
              for (const pin of pins) {
                await Order.create({
                  phone: normalizedPhone,
                  pin: pin._id,
                  pinCode: pin.code,
                  cardType: type,
                  amount: PRICES[type],
                  paymentStatus: "paid",
                });
                pin.soldTo = normalizedPhone;
                await pin.save();
              }

              const pinList = pins.map((p, i) => `PIN ${i + 1}: ${p.code}`).join("\n");
              await sendPinSMS(normalizedPhone, pinList, label);

              response =
                `END Payment successful!\n` +
                `Your ${qty} ${label} PIN(s) have been\n` +
                `sent to ${momoNumber} via SMS.\n` +
                `Check your messages now.`;
            }
          }
        } else {
          response = "END Invalid option. Please try again.";
        }
      }

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

          // Get last 5 orders for this number
          const orders = await Order.find({ phone: formattedSearch, paymentStatus: "paid" })
            .sort({ createdAt: -1 })
            .limit(5);

          if (orders.length === 0) {
            response =
              `END No vouchers found for\n${momoNumber}.\n\n` +
              `Please check the number and try again.`;
          } else {
            // Resend all found PINs via SMS
            const pinList = orders.map((o, i) => `${o.cardType} PIN ${i+1}: ${o.pinCode}`).join("\n");
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