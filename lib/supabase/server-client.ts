import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { config } from "@/lib/config/env";

// Server side Supabase client for the App Router. It reads the user's session
// from request cookies and acts as that user with the anon key, never the service
// role key. The URL and anon key come from the validated config. This client is
// how server code (route handlers, server components) learns who is signed in.

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll can be called from a Server Component where cookies are read
          // only. The middleware refreshes the session cookie instead, so this is
          // safe to ignore.
        }
      },
    },
  });
}

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
