// Types for chatbot.config.js

export type ChatbotConfig = {
  cafeName: string;
  contact: { phone: string; address: string };
  timings: Array<{ days: string; hours: string }>;
  reservation: {
    timeSlots: string[];
    maxPartyOnline: number;
    howToBook: string[];
    availability: string;
    statusCheck: string;
    cancelModify: string;
    policies: string[];
  };
  petPolicy: { allowed: boolean; summary: string; rules: string[] };
  founders: { names: string[]; story: string };
  MIN_ALCOHOL_AGE: number;
  quickReplies: string[];
  welcome: string;
  outOfScopeReply: string;
};

export const CHATBOT_CONFIG: ChatbotConfig;
export default CHATBOT_CONFIG;
