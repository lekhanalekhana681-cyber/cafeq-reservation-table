/**
 * Vercel Serverless Function: /api/send-sms
 * Sends SMS via Twilio server-side (avoids CORS + keeps credentials secure).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ error: "Missing to or message" });
  }

  const sid = process.env.TWILIO_SID || process.env.VITE_TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.VITE_TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE || process.env.VITE_TWILIO_FROM_PHONE;

  if (!sid || !authToken || !fromPhone) {
    console.warn("[send-sms] Twilio not configured. Sandbox mode.");
    return res.status(200).json({ success: true, messageId: "mock_" + Date.now(), provider: "sandbox" });
  }

  try {
    const body = new URLSearchParams({ To: to, From: fromPhone, Body: message });
    const twilioRes = await fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(sid + ":" + authToken).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );
    const data = await twilioRes.json();
    if (!twilioRes.ok) {
      return res.status(502).json({ success: false, error: data?.message || "Twilio error" });
    }
    return res.status(200).json({ success: true, messageId: data.sid, provider: "twilio" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || "Internal error" });
  }
}
