import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service role: server only. Used for method_* tables and scheduler.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
