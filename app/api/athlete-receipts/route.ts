import { z } from "zod";

import {
  friendlySupabaseError,
  getSupabaseAdmin,
  RECEIPTS_BUCKET,
} from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const payload = z.object({
  athleteName: z.string().trim().min(1).max(160),
  athleteCode: z.string().trim().min(1).max(80),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptUrl: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (value) =>
        value.startsWith("/api/receipts/") || /^https?:\/\//.test(value),
      "Invalid receipt image",
    ),
});

const selectFields = `
  id,
  athleteName:athlete_name,
  athleteCode:athlete_code,
  receiptDate:receipt_date,
  receiptUrl:receipt_url,
  createdAt:created_at
`;

function monthRange(value: string | null) {
  const match = value?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);

  if (!match) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return monthRange(`${year}-${month}`);
  }

  const start = `${match[1]}-${match[2]}-01`;
  const end = new Date(
    Date.UTC(Number(match[1]), Number(match[2]), 1),
  )
    .toISOString()
    .slice(0, 10);

  return { start, end };
}

function receiptKey(value: string) {
  if (!value.startsWith("/api/receipts/")) return null;

  try {
    return decodeURIComponent(value.slice("/api/receipts/".length));
  } catch {
    return null;
  }
}

async function deleteReceiptFile(value: string) {
  const key = receiptKey(value);
  if (!key) return;

  const { error } = await getSupabaseAdmin()
    .storage
    .from(RECEIPTS_BUCKET)
    .remove([key]);

  if (error) {
    console.error("Failed to remove athlete receipt image", error);
  }
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { start, end } = monthRange(
      new URL(request.url).searchParams.get("month"),
    );

    const { data, error } = await supabase
      .from("athlete_receipts")
      .select(selectFields)
      .gte("receipt_date", start)
      .lt("receipt_date", end)
      .order("receipt_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ receipts: data ?? [] });
  } catch (error) {
    console.error("Failed to load athlete receipts", error);
    return Response.json(
      { error: friendlySupabaseError(error) },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const value = payload.parse(await request.json());
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const { error } = await getSupabaseAdmin()
      .from("athlete_receipts")
      .insert({
        id,
        athlete_name: value.athleteName,
        athlete_code: value.athleteCode,
        receipt_date: value.receiptDate,
        receipt_url: value.receiptUrl,
        created_at: now,
        updated_at: now,
      });

    if (error) throw error;

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Complete the athlete name, code, date, and receipt image." },
        { status: 400 },
      );
    }

    console.error("Failed to save athlete receipt", error);
    return Response.json(
      { error: friendlySupabaseError(error) },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const id = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("id"));

    const supabase = getSupabaseAdmin();

    const { data: previous, error: previousError } = await supabase
      .from("athlete_receipts")
      .select("receiptUrl:receipt_url")
      .eq("id", id)
      .maybeSingle();

    if (previousError) throw previousError;

    const { error } = await supabase
      .from("athlete_receipts")
      .delete()
      .eq("id", id);

    if (error) throw error;

    if (previous?.receiptUrl) {
      await deleteReceiptFile(previous.receiptUrl);
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid athlete receipt." }, { status: 400 });
    }

    console.error("Failed to delete athlete receipt", error);
    return Response.json(
      { error: friendlySupabaseError(error) },
      { status: 503 },
    );
  }
}
