import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export class SupabaseBrowserSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseBrowserSetupError";
  }
}

export function getSupabaseBrowser() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new SupabaseBrowserSetupError(
      "NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.",
    );
  }

  if (!publishableKey) {
    throw new SupabaseBrowserSetupError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing from .env.local.",
    );
  }

  browserClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
