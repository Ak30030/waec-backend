const sendPinSMS = async (phoneNumber, pinCode, cardType) => {
  const message =
    `Your WAEC ${cardType} Result Checker PIN:\n` +
    `PIN: ${pinCode}\n` +
    `Visit waecdirect.org to check your results.\n` +
    `Thank you!`;

  try {
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: {
        "api-key": process.env.ARKESEL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: process.env.ARKESEL_SENDER_ID || "WaecSell",
        message,
        recipients: [phoneNumber],
      }),
    });

    const data = await res.json();

    if (data.status === "success") {
      console.log(`SMS sent to ${phoneNumber}`);
      return { success: true, data };
    } else {
      console.error("Arkesel error:", data);
      return { success: false, data };
    }
  } catch (err) {
    console.error("SMS send failed:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendPinSMS };
