const sendPinSMS = async (phoneNumber, pinCode, cardType) => {
 const resultLinks = {
  BECE: "https://eresults.waecgh.org",
  WASSCE_SCHOOL: "https://waecdirect.org",
  WASSCE_PRIVATE: "https://waecdirect.org",
};

// Pick the right link based on card type
const resultLink = resultLinks[cardType] || "https://waecdirect.org";

const message =
  `Your WAEC ${cardType} Result Checker:\n` +
  `${pinCode}\n\n` +
  `Visit ${resultLink} to check your results.\n` +
  `Thank you!`;

  // NALO expects phone in international format without +: 233XXXXXXXXX
  const formattedPhone = phoneNumber.startsWith("+")
    ? phoneNumber.slice(1)
    : phoneNumber.startsWith("0")
    ? "233" + phoneNumber.slice(1)
    : phoneNumber;

  console.log("Sending SMS to:", formattedPhone);
  console.log("NALO_USERNAME set:", !!process.env.NALO_USERNAME);

  try {
    const res = await fetch(process.env.NALO_SMS_URL || "https://api.nalosolutions.com/smsservice/api/sendmessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: process.env.NALO_USERNAME,
        password: process.env.NALO_PASSWORD,
        msisdn: formattedPhone,
        message: message,
        sender_id: process.env.NALO_SENDER_ID || "eCards",
      }),
    });

    const rawText = await res.text();
    console.log("NALO SMS Raw Response:", rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("NALO returned non-JSON:", rawText);
      return { success: false, error: rawText };
    }

    // NALO returns status code 1000 for success — adjust if their docs say otherwise
    if (data.status === "1000" || data.status === 1000 || data.code === "1000") {
      console.log(`SMS sent successfully to ${formattedPhone}`);
      return { success: true, data };
    } else {
      console.error("NALO SMS failed:", JSON.stringify(data));
      return { success: false, data };
    }
  } catch (err) {
    console.error("SMS send failed:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendPinSMS };