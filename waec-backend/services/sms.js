const sendPinSMS = async (phoneNumber, pinCode, cardType) => {
  const message =
    `Your WAEC ${cardType} Result Checker PIN:\n` +
    `PIN: ${pinCode}\n` +
    `Visit waecdirect.org to check your results.\n` +
    `Thank you!`;

  const formattedPhone = phoneNumber.startsWith("0")
    ? "+233" + phoneNumber.slice(1)
    : phoneNumber.startsWith("+233")
    ? phoneNumber
    : "+233" + phoneNumber;

  const params = new URLSearchParams({
    username: process.env.AT_USERNAME,
    to: formattedPhone,
    message: message,
  });

  if (process.env.AT_SENDER_ID) {
    params.append("from", process.env.AT_SENDER_ID);
  }

  console.log("Sending SMS to:", formattedPhone);
  console.log("AT_USERNAME:", process.env.AT_USERNAME);
  console.log("AT_API_KEY set:", !!process.env.AT_API_KEY);

  try {
    const url = process.env.AT_USERNAME === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        apiKey: process.env.AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    const rawText = await res.text();
    console.log("AT Raw Response:", rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("AT returned non-JSON:", rawText);
      return { success: false, error: rawText };
    }

    const recipient = data.SMSMessageData?.Recipients?.[0];

    if (recipient?.status === "Success") {
      console.log(`SMS sent successfully to ${formattedPhone}`);
      return { success: true, data };
    } else {
      console.error("AT SMS failed:", JSON.stringify(data));
      return { success: false, data };
    }
  } catch (err) {
    console.error("SMS send failed:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendPinSMS };