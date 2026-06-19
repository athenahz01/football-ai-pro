import { createClient } from "@supabase/supabase-js";

import { config } from "../config/env";

if (typeof window !== "undefined") {
  throw new Error(
    "The Supabase service-role client can only run on the server.",
  );
}

export const supabaseServiceClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
