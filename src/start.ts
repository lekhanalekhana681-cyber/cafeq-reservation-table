import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export const startConfig = {
  functionMiddleware: [attachSupabaseAuth],
  renderErrorPage,
};
