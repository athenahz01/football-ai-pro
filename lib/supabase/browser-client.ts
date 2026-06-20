import { createBrowserClient } from "@supabase/ssr";

// Browser side Supabase client. It runs in the user's browser, so it may only
// ever use the public anon key. The service role key and the database URL never
// reach client code. The two values below are public by design and are inlined
// from the NEXT_PUBLIC environment variables at build time.

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.local to enable sign in.",
    );
  }

  return createBrowserClient(url, anonKey);
}
