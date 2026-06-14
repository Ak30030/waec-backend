const sendPinSMS = async (phoneNumber, pinCode, cardType) => {
  const message =
    `Your WAEC ${cardType} Result Checker PIN:\n` +
    `PIN: ${pinCode}\n` +
    `Visit waecdirect.org to check your results.\n` +
    `Thank you!`;

  // Africa's Talking expects phone in international format: +233XXXXXXXXX
  const formattedPhone = phoneNumber.startsWith("0")
    ? "+233" + phoneNumber.slice(1)
    : phoneNumber;

  const params = new URLSearchParams({
    username: process.env.AT_USERNAME,
    to: formattedPhone,
    message: message,
    from: "WaecSell", // your registered sender ID
  });

  try {
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey: process.env.AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    const data = await res.json();
    const recipient = data.SMSMessageData?.Recipients?.[0];

    if (recipient?.status === "Success") {
      console.log(`SMS sent to ${formattedPhone}`);
      return { success: true, data };
    } else {
      console.error("AT SMS error:", data);
      return { success: false, data };
    }
  } catch (err) {
    console.error("SMS send failed:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendPinSMS };