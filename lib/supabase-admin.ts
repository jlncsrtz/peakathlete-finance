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
      "Supabase server secret is missing. Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY to your environment variables."
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

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
  statusCode?: number;
};

export function friendlySupabaseError(error: unknown) {
  if (error instanceof SupabaseSetupError) {
    return error.message;
  }

  const value: SupabaseErrorLike =
    error && typeof error === "object"
      ? (error as SupabaseErrorLike)
      : {};

  const message = String(value.message ?? "").trim();
  const details = String(value.details ?? "").trim();
  const hint = String(value.hint ?? "").trim();
  const code = String(value.code ?? "").trim();
  const status = Number(value.status ?? value.statusCode ?? 0);

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
    return "Supabase denied database access. Check that your server environment uses SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.";
  }

  if (
    status === 401 ||
    /invalid.*api.*key/i.test(message) ||
    /unauthorized/i.test(message)
  ) {
    return "The Supabase URL/key pair is invalid. Copy the Project URL and server secret from the same Supabase project.";
  }

  if (
    /fetch failed/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ETIMEDOUT/i.test(message) ||
    /network/i.test(message)
  ) {
    return "The app could not reach Supabase. Check SUPABASE_URL, the server key, and your network connection.";
  }

  const parts: string[] = [];

  if (message) parts.push(message);

  if (details && details !== message) {
    parts.push(details);
  }

  if (hint) {
    parts.push(`Hint: ${hint}`);
  }

  if (code) {
    parts.push(`Code: ${code}`);
  }

  if (parts.length > 0) {
    return `Supabase request failed: ${parts.join(" | ")}`;
  }

  return "A Supabase request failed, but no error details were returned. Check the failed API request in the browser Network tab and the Vercel Function logs.";
}