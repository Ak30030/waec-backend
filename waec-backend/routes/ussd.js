const express = require("express");
const router = express.Router();
const Pin = require("../models/Pin");
const Order = require("../models/Order");
const Settings = require("../models/Settings");
const { sendPinSMS } = require("../services/sms");

// Helper: get current prices from DB
const getPrices = async () => {
  let settings = await Settings.findOne({ key: "prices" });
  if (!settings) settings = await Settings.create({ key: "prices" });
  return {
    BECE: settings.BECE,
    WASSCE_SCHOOL: settings.WASSCE_SCHOOL,
    WASSCE_PRIVATE: settings.WASSCE_PRIVATE,
    bulkContactNumber: settings.bulkContactNumber,
  };
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

// Helper: build NALO response
// MSGTYPE: false = keep session open (CON), true = end session (END)
const naloResponse = (res, USERID, MSISDN, message, keepOpen) => {
  res.json({
    USERID,
    MSISDN,
    MSG: message,
    MSGTYPE: !keepOpen, // false = continue, true = end
  });
};

router.post("/", async (req, res) => {
  // NALO field names (uppercase)
  const { USERID, MSISDN, USERDATA, MSGTYPE } = req.body;

  console.log("NALO USSD request:", { USERID, MSISDN, USERDATA, MSGTYPE });

  // Normalize phone to +233 format for internal use
  const normalizedPhone = MSISDN.startsWith("0")
    ? "+233" + MSISDN.slice(1)
    : MSISDN.startsWith("233")
    ? "+" + MSISDN
    : MSISDN.startsWith("+233")
    ? MSISDN
    : "+" + MSISDN;

  const text = USERDATA || "";
  const inputs = text ? text.split("*") : [];

  try {
    // Live prices fetched fresh on every request
    const PRICES = await getPrices();

    // ── MAIN MENU ───────────────────────────────────────────────
    if (text === "" || text === null) {
      return naloResponse(res, USERID, MSISDN,
        `Welcome to WaecSell\n` +
        `Buy your Result Checker Voucher\n\n` +
        `1. WASSCE Checker\n` +
        `2. BECE Checker\n` +
        `3. Buy in Bulk\n` +
        `4. Retrieve Voucher\n` +
        `0. Exit`,
        true // keep open
      );

    // ── EXIT ────────────────────────────────────────────────────
    } else if (text === "0") {
      return naloResponse(res, USERID, MSISDN,
        "Thank you for using WaecSell. Goodbye!",
        false // end session
      );

    // ══════════════════════════════════════════════════════════════
    // OPTION 1 — WASSCE CHECKER
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "1") {

      if (inputs.length === 1) {
        return naloResponse(res, USERID, MSISDN,
          `WASSCE Checker\n` +
          `Select checker type:\n\n` +
          `1. School Candidate\n` +
          `2. Private Candidate\n` +
          `0. Back`,
          true
        );

      } else if (inputs[1] === "0") {
        return naloResponse(res, USERID, MSISDN,
          `Welcome to WaecSell\n\n` +
          `1. WASSCE Checker\n` +
          `2. BECE Checker\n` +
          `3. Buy in Bulk\n` +
          `4. Retrieve Voucher\n` +
          `0. Exit`,
          true
        );

      } else if (inputs.length === 2 && (inputs[1] === "1" || inputs[1] === "2")) {
        const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
        const label = inputs[1] === "1" ? "School" : "Private";
        return naloResponse(res, USERID, MSISDN,
          `WASSCE ${label} Checker\n` +
          `Price: GHS ${PRICES[type]} each\n\n` +
          `Enter quantity (1-5):`,
          true
        );

      } else if (inputs.length === 3) {
        const qty = parseInt(inputs[2]);
        if (isNaN(qty) || qty < 1 || qty > 5) {
          return naloResponse(res, USERID, MSISDN,
            "Invalid quantity. Please enter a number between 1 and 5.",
            false
          );
        }
        const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
        const total = PRICES[type] * qty;
        return naloResponse(res, USERID, MSISDN,
          `Enter your MoMo number to pay:\n` +
          `Total: GHS ${total} for ${qty} voucher(s)\n\n` +
          `(e.g. 0241234567)`,
          true
        );

      } else if (inputs.length === 4) {
        const qty = parseInt(inputs[2]);
        const momoNumber = inputs[3];
        const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
        const label = inputs[1] === "1" ? "School" : "Private";
        const total = PRICES[type] * qty;
        const phoneRegex = /^0[235][0-9]{8}$/;

        if (!phoneRegex.test(momoNumber)) {
          return naloResponse(res, USERID, MSISDN,
            "Invalid MoMo number. Please try again with a valid Ghana number.",
            false
          );
        }
        return naloResponse(res, USERID, MSISDN,
          `Confirm Purchase\n\n` +
          `Type: WASSCE ${label}\n` +
          `Quantity: ${qty}\n` +
          `Amount: GHS ${total}\n` +
          `MoMo: ${momoNumber}\n\n` +
          `1. Confirm & Pay\n` +
          `2. Cancel`,
          true
        );

      } else if (inputs.length === 5) {
        if (inputs[4] === "2") {
          return naloResponse(res, USERID, MSISDN, "Purchase cancelled. Thank you!", false);
        } else if (inputs[4] === "1") {
          const qty = parseInt(inputs[2]);
          const momoNumber = inputs[3];
          const type = inputs[1] === "1" ? "WASSCE_SCHOOL" : "WASSCE_PRIVATE";
          const label = inputs[1] === "1" ? "School" : "Private";

          const hasStock = await checkStock(type, qty);
          if (!hasStock) {
            return naloResponse(res, USERID, MSISDN,
              `Sorry, not enough WASSCE ${label} vouchers in stock.\nPlease try a smaller quantity or check back later.`,
              false
            );
          }
          const pins = await pickPins(type, qty);
          if (pins.length < qty) {
            return naloResponse(res, USERID, MSISDN,
              "Sorry, stock ran out during your purchase. Please try again.",
              false
            );
          }
          await saveOrders(pins, normalizedPhone, type, PRICES[type]);
          const pinList = buildPinList(pins);
          await sendPinSMS(normalizedPhone, pinList, `WASSCE ${label}`);
          return naloResponse(res, USERID, MSISDN,
            `Payment successful!\n` +
            `Your ${qty} WASSCE ${label} PIN(s)\n` +
            `have been sent to ${momoNumber} via SMS.\n` +
            `Check your messages now.`,
            false
          );
        } else {
          return naloResponse(res, USERID, MSISDN, "Invalid option. Please try again.", false);
        }
      }

    // ══════════════════════════════════════════════════════════════
    // OPTION 2 — BECE CHECKER
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "2") {

      if (inputs.length === 1) {
        return naloResponse(res, USERID, MSISDN,
          `BECE Checker\n` +
          `Price: GHS ${PRICES.BECE} each\n\n` +
          `Enter quantity (1-5):`,
          true
        );

      } else if (inputs.length === 2) {
        const qty = parseInt(inputs[1]);
        if (isNaN(qty) || qty < 1 || qty > 5) {
          return naloResponse(res, USERID, MSISDN,
            "Invalid quantity. Please enter a number between 1 and 5.",
            false
          );
        }
        const total = PRICES.BECE * qty;
        return naloResponse(res, USERID, MSISDN,
          `Enter your MoMo number to pay:\n` +
          `Total: GHS ${total} for ${qty} voucher(s)\n\n` +
          `(e.g. 0241234567)`,
          true
        );

      } else if (inputs.length === 3) {
        const qty = parseInt(inputs[1]);
        const momoNumber = inputs[2];
        const total = PRICES.BECE * qty;
        const phoneRegex = /^0[235][0-9]{8}$/;

        if (!phoneRegex.test(momoNumber)) {
          return naloResponse(res, USERID, MSISDN,
            "Invalid MoMo number. Please try again.",
            false
          );
        }
        return naloResponse(res, USERID, MSISDN,
          `Confirm Purchase\n\n` +
          `Type: BECE\n` +
          `Quantity: ${qty}\n` +
          `Amount: GHS ${total}\n` +
          `MoMo: ${momoNumber}\n\n` +
          `1. Confirm & Pay\n` +
          `2. Cancel`,
          true
        );

      } else if (inputs.length === 4) {
        if (inputs[3] === "2") {
          return naloResponse(res, USERID, MSISDN, "Purchase cancelled. Thank you!", false);
        } else if (inputs[3] === "1") {
          const qty = parseInt(inputs[1]);
          const momoNumber = inputs[2];

          const hasStock = await checkStock("BECE", qty);
          if (!hasStock) {
            return naloResponse(res, USERID, MSISDN,
              "Sorry, not enough BECE vouchers in stock.\nPlease try a smaller quantity or check back later.",
              false
            );
          }
          const pins = await pickPins("BECE", qty);
          if (pins.length < qty) {
            return naloResponse(res, USERID, MSISDN,
              "Sorry, stock ran out during your purchase. Please try again.",
              false
            );
          }
          await saveOrders(pins, normalizedPhone, "BECE", PRICES.BECE);
          const pinList = buildPinList(pins);
          await sendPinSMS(normalizedPhone, pinList, "BECE");
          return naloResponse(res, USERID, MSISDN,
            `Payment successful!\n` +
            `Your ${qty} BECE PIN(s) have been\n` +
            `sent to ${momoNumber} via SMS.\n` +
            `Check your messages now.`,
            false
          );
        } else {
          return naloResponse(res, USERID, MSISDN, "Invalid option. Please try again.", false);
        }
      }

    // ══════════════════════════════════════════════════════════════
    // OPTION 3 — BUY IN BULK
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "3") {
      return naloResponse(res, USERID, MSISDN,
        `For bulk purchases please\n` +
        `contact us on:\n` +
        `${PRICES.bulkContactNumber}\n\n` +
        `We will get back to you shortly.`,
        false
      );

    // ══════════════════════════════════════════════════════════════
    // OPTION 4 — RETRIEVE VOUCHER
    // ══════════════════════════════════════════════════════════════
    } else if (inputs[0] === "4") {

      if (inputs.length === 1) {
        return naloResponse(res, USERID, MSISDN,
          `Retrieve Your Voucher\n\n` +
          `Enter the phone number used\n` +
          `during purchase:\n` +
          `(e.g. 0241234567)`,
          true
        );

      } else if (inputs.length === 2) {
        const momoNumber = inputs[1];
        const phoneRegex = /^0[235][0-9]{8}$/;

        if (!phoneRegex.test(momoNumber)) {
          return naloResponse(res, USERID, MSISDN,
            "Invalid phone number. Please try again.",
            false
          );
        }

        const formattedSearch = "+233" + momoNumber.slice(1);
        const orders = await Order.find({ phone: formattedSearch, paymentStatus: "paid" })
          .sort({ createdAt: -1 })
          .limit(5);

        if (orders.length === 0) {
          return naloResponse(res, USERID, MSISDN,
            `No vouchers found for\n${momoNumber}.\n\nPlease check the number and try again.`,
            false
          );
        }

        const pinList = orders.map((o, i) =>
          `Voucher ${i + 1}:\nType: ${o.cardType}\nSerial: ${o.serial || "N/A"}\nPIN: ${o.pinCode}`
        ).join("\n\n");
        await sendPinSMS(formattedSearch, pinList, "Retrieved");
        return naloResponse(res, USERID, MSISDN,
          `Your voucher(s) have been\n` +
          `resent to ${momoNumber} via SMS.\n` +
          `Check your messages now.`,
          false
        );
      }

    } else {
      return naloResponse(res, USERID, MSISDN, "Invalid option. Please try again.", false);
    }

  } catch (err) {
    console.error("USSD error:", err);
    return naloResponse(res, USERID, MSISDN, "An error occurred. Please try again.", false);
  }
});

module.exports = router;