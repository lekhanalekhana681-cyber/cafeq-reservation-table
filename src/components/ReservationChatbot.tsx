import { useEffect, useRef, useState } from "react";
import { Leaf, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answerChat, type ChatAnswer } from "../../api/_lib/chatbot-engine.js";
import { CHATBOT_CONFIG } from "../../config/chatbot.config.js";
import { getStoredMenu } from "@/lib/menu";
import { getAllBookings } from "@/lib/bookings.functions";
import { getCafeSettings } from "@/lib/settings.functions";

type ChatMessage = { id: number; from: "bot" | "user"; answer?: ChatAnswer; text?: string };

/**
 * Same engine, run in the browser when /api/chatbot isn't reachable
 * (e.g. `npm run dev` without `vercel dev`). Menu comes from the app's menu store.
 */
async function answerLocally(message: string): Promise<ChatAnswer> {
  const menu = getStoredMenu().map((m) => ({
    name: m.name,
    category: m.category,
    price: m.price,
    isVeg: m.isVeg,
    isAlcoholic: m.isAlcoholic,
    isAvailable: m.isAvailable,
  }));
  const settings = await getCafeSettings().catch(() => null);
  return answerChat(message, {
    menu: menu.length > 0 ? menu : null,
    settings,
    lookupBooking: async (code) => {
      const b = (await getAllBookings()).find((x) => x.code.toUpperCase() === code);
      return b ? { status: b.status, date: b.date, time: b.time } : null;
    },
  });
}

async function askAssistant(message: string): Promise<ChatAnswer> {
  try {
    const res = await fetch("/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json(); // dev server answers /api/* with HTML → falls back below
    if (res.ok && typeof data?.reply === "string") return data as ChatAnswer;
  } catch {
    // fall through to the local engine
  }
  return answerLocally(message);
}

export function ReservationChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 0, from: "bot", answer: { intent: "welcome", reply: CHATBOT_CONFIG.welcome, quickReplies: CHATBOT_CONFIG.quickReplies } },
  ]);
  const nextId = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { id: nextId.current++, from: "user", text: message }]);
    setBusy(true);
    try {
      const answer = await askAssistant(message);
      setMessages((prev) => [...prev, { id: nextId.current++, from: "bot", answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          from: "bot",
          answer: {
            intent: "error",
            reply: `Sorry, I'm not sure right now. Please call the cafe on ${CHATBOT_CONFIG.contact.phone}.`,
          },
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="CafeQ assistant"
          className="fixed z-40 bottom-20 left-4 right-4 sm:left-auto sm:right-5 sm:w-[380px] h-[min(72vh,580px)] flex flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div>
              <p className="font-display font-semibold text-foreground">Ask {CHATBOT_CONFIG.cafeName}</p>
              <p className="text-[11px] text-muted-foreground">Reservations · Menu · Pets · Founders · Cocktails (18+)</p>
            </div>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="size-4" />
            </Button>
          </div>

          <div ref={logRef} role="log" aria-live="polite" className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m) =>
              m.from === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-line">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-start gap-2">
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-secondary/70 text-foreground px-3 py-2 text-sm whitespace-pre-line">
                    {m.answer?.reply}
                    {m.answer?.sections?.map((s) => (
                      <div key={s.title} className="mt-3">
                        <p className="text-xs font-semibold text-foreground">
                          {s.title}
                          {s.note && <span className="ml-1.5 font-normal text-[10px] text-destructive">({s.note})</span>}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {s.items.map((i) => (
                            <li key={i.name} className="flex justify-between gap-3 text-xs">
                              <span className="flex items-center gap-1 min-w-0">
                                {i.veg && <Leaf className="size-3 text-emerald-600 shrink-0" aria-label="Vegetarian" />}
                                <span className="truncate">{i.name}</span>
                              </span>
                              <span className="font-medium text-accent shrink-0">{i.price}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {m.answer?.quickReplies && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.answer.quickReplies.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => send(q)}
                          disabled={busy}
                          className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Typing…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about bookings, menu, pets…"
              maxLength={500}
              aria-label="Message"
              className="text-sm"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}

      <Button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed z-40 bottom-5 right-5 rounded-full shadow-lg h-12 px-4 gap-2"
        aria-expanded={open}
        aria-label={open ? "Close CafeQ assistant" : "Open CafeQ assistant"}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
        <span className="hidden sm:inline text-sm">{open ? "Close" : "Ask CafeQ"}</span>
      </Button>
    </>
  );
}
