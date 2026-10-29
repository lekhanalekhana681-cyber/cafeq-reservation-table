// Types for chatbot-engine.js (shared by /api/chatbot and the Reservation page widget)

export type ChatMenuRow = {
  name: string;
  category: string;
  price: number;
  isVeg?: boolean;
  isAlcoholic?: boolean;
  isAvailable?: boolean;
};

export type ChatSection = {
  title: string;
  note?: string;
  items: Array<{ name: string; price: string; veg?: boolean }>;
};

export type ChatAnswer = {
  intent: string;
  reply: string;
  sections?: ChatSection[];
  quickReplies?: string[];
};

export type ChatContext = {
  /** Live menu rows; null/undefined = couldn't load (the bot says it's unsure). */
  menu?: ChatMenuRow[] | null;
  settings?: {
    preorderPaymentMode: string;
    depositPercent: number;
    depositMinInr: number;
    refundCutoffMinutes: number;
  } | null;
  lookupBooking?: (code: string) => Promise<{ status: string; date?: string; time?: string } | null>;
  config?: unknown;
};

export function answerChat(message: string, ctx?: ChatContext): Promise<ChatAnswer>;
export function findMenuItems(text: string, menu: ChatMenuRow[]): ChatMenuRow[];
export function formatPrice(price: number): string;
