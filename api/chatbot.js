/**
 * POST /api/chatbot  { message }  →  { intent, reply, sections?, quickReplies? }
 * Reservation page assistant. Answers only about reservations, menu & prices, pet policy,
 * founders and 18+ cocktails (keyword/intent matching — no external AI).
 * Editable content: config/chatbot.config.js. Menu data: the live menu_items table.
 */
import { answerChat } from "./_lib/chatbot-engine.js";
import { bookingLookup, fetchMenu, fetchPreorderSettings } from "./_lib/chatbot-data.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function POST(request) {
  let message = "";
  try {
    ({ message } = await request.json());
  } catch {
    return json(400, { error: "Send JSON like { \"message\": \"show menu\" }." });
  }
  if (typeof message !== "string") return json(400, { error: "message must be a string." });

  try {
    const [menu, settings] = await Promise.all([fetchMenu(), fetchPreorderSettings()]);
    const answer = await answerChat(message, { menu, settings, lookupBooking: bookingLookup() });
    return json(200, answer);
  } catch (err) {
    console.error("[chatbot] error:", err);
    return json(500, { error: "The assistant is unavailable right now. Please try again." });
  }
}
