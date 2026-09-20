import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export const RECEIPTS_BUCKET =
  process.env.SUPABASE_RECEIPTS_BUCKET || "receipts";

export class SupabaseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseSetupError";
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new SupabaseSetupError(
      "Supabase URL is missing. Add SUPABASE_URL to your environment variables."
    );
  }

  if (!secretKey) {
    throw new SupabaseSetupError(
      "Supabase server secret is missing. Add SUPABASE_SECRET_KEY with your sb_secret_... key."
    );
  }

  cachedClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

export function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
  );
}

export function friendlySupabaseError(error: unknown) {
  if (error instanceof SupabaseSetupError) {
    return error.message;
  }

  const value =
    error && typeof error === "object"
      ? (error as {
          code?: string;
          message?: string;
          details?: string;
          hint?: string;
          status?: number;
        })
      : {};

  const message = String(value.message ?? "");
  const code = String(value.code ?? "");

  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return "The Supabase database tables are missing. Run the full supabase/schema.sql file in Supabase SQL Editor.";
  }

  if (
    code === "42501" ||
    /permission denied/i.test(message)
  ) {
    return "Supabase denied database access. Use the server Secret key (sb_secret_...) for SUPABASE_SECRET_KEY.";
  }

  if (
    value.status === 401 ||
    /invalid.*api.*key/i.test(message) ||
    /unauthorized/i.test(message)
  ) {
    return "The Supabase URL/key pair is invalid. Copy the Project URL and Secret key from the same Supabase project.";
  }

  if (
    /fetch failed/i.test(message) ||
    /ENOTFOUND/i.test(message)
  ) {
    return "The app could not reach Supabase. Check SUPABASE_URL and your internet connection.";
  }

  return "Supabase could not load the database. Check /api/health for the exact setup status.";
}