import { z } from "zod";

import { friendlySupabaseError, getSupabaseAdmin, isUniqueViolation, RECEIPTS_BUCKET } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const expensePayload = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expenseNumber: z.string().trim().max(40).optional().default(""),
  receiptReference: z.string().trim().max(100).optional().default(""),
  vendor: z.string().trim().min(1).max(160),
  expenseType: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().min(1).max(240),
  quantity: z.coerce.number().int().positive().max(100000),
  unitCost: z.coerce.number().min(0).max(100000000),
  taxFees: z.coerce.number().min(0).max(100000000).default(0),
  amountPaid: z.coerce.number().min(0).max(100000000).default(0),
  paymentStatus: z.enum(["Unpaid", "Partial", "Paid"]),
  paymentMethod: z.string().trim().min(1).max(60),
  productCollection: z.string().trim().max(120).optional().default(""),
  receiptUrl: z.string().trim().max(500).refine(
    (value) => value === "" || value.startsWith("/api/receipts/") || /^https?:\/\//.test(value),
    "Invalid receipt image",
  ).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});

function receiptKey(value: string) {
  if (!value.startsWith("/api/receipts/")) return null;
  try { return decodeURIComponent(value.slice("/api/receipts/".length)); }
  catch { return null; }
}

async function deleteReceipt(value: string) {
  const key = receiptKey(value);
  if (!key) return;
  const { error } = await getSupabaseAdmin().storage.from(RECEIPTS_BUCKET).remove([key]);
  if (error) console.error("Failed to remove old receipt", error);
}

function cents(value: number) {
  return Math.round(value * 100);
}

function rangeForMonth(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const now = new Date();
    return rangeForMonth(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const month = `${match[1]}-${match[2]}`;
  const start = `${month}-01`;
  const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1)).toISOString().slice(0, 10);
  return { month, start, end };
}

function totals(value: z.infer<typeof expensePayload>) {
  const totalCents = cents(value.quantity * value.unitCost + value.taxFees);

  let amountPaidCents = 0;

  if (value.paymentStatus === "Paid") {
    amountPaidCents = totalCents;
  } else if (value.paymentStatus === "Partial") {
    amountPaidCents = Math.min(
      Math.max(cents(value.amountPaid), 0),
      Math.max(totalCents - 1, 0),
    );
  }

  return {
    totalCents,
    amountPaidCents,
    paymentStatus: value.paymentStatus,
  };
}

const expenseSelect = `
  id,
  expenseDate:expense_date,
  expenseNumber:expense_number,
  receiptReference:receipt_reference,
  vendor,
  expenseType:expense_type,
  category,
  subcategory,
  description,
  quantity,
  unitCostCents:unit_cost_cents,
  taxFeesCents:tax_fees_cents,
  totalCents:total_cents,
  amountPaidCents:amount_paid_cents,
  paymentMethod:payment_method,
  paymentStatus:payment_status,
  productCollection:product_collection,
  receiptUrl:receipt_url,
  notes,
  createdAt:created_at,
  updatedAt:updated_at
`;

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const range = url.searchParams.get("range");
    const exactDate = url.searchParams.get("date");
    const requestedMonth = url.searchParams.get("month");

    let expenseQuery = supabase
      .from("expenses")
      .select(expenseSelect);

    let budgetCents = 0;

    if (range === "all") {
      // No date restriction.
    } else if (exactDate && /^\d{4}-\d{2}-\d{2}$/.test(exactDate)) {
      expenseQuery = expenseQuery.eq("expense_date", exactDate);
    } else {
      const { month, start, end } = rangeForMonth(requestedMonth);
      expenseQuery = expenseQuery
        .gte("expense_date", start)
        .lt("expense_date", end);

      const budgetResult = await supabase
        .from("monthly_budgets")
        .select("amountCents:amount_cents")
        .eq("month", month)
        .maybeSingle();

      if (budgetResult.error) throw budgetResult.error;
      budgetCents = budgetResult.data?.amountCents ?? 0;
    }

    const expenseResult = await expenseQuery
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (expenseResult.error) throw expenseResult.error;

    return Response.json({
      expenses: expenseResult.data ?? [],
      budgetCents,
    });
  } catch (error) {
    console.error("Failed to load expenses", error);
    return Response.json({ error: friendlySupabaseError(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = z.object({ resource: z.enum(["expense", "budget"]) }).passthrough().parse(await request.json());
    const now = new Date().toISOString();

    if (body.resource === "budget") {
      const value = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), amount: z.coerce.number().min(0).max(100000000) }).parse(body);
      const { error } = await supabase.from("monthly_budgets").upsert({
        month: value.month,
        amount_cents: cents(value.amount),
        updated_at: now,
      }, { onConflict: "month" });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const value = expensePayload.parse(body);
    const id = crypto.randomUUID();
    const suffix = id.replaceAll("-", "").slice(0, 6).toUpperCase();
    const expenseNumber = value.expenseNumber || `PA-EXP-${value.expenseDate.replaceAll("-", "")}-${suffix}`;
    const computed = totals(value);

    const { error } = await supabase.from("expenses").insert({
      id,
      expense_date: value.expenseDate,
      expense_number: expenseNumber,
      receipt_reference: value.receiptReference,
      vendor: value.vendor,
      expense_type: value.expenseType,
      category: value.category,
      subcategory: value.subcategory,
      description: value.description,
      quantity: value.quantity,
      unit_cost_cents: cents(value.unitCost),
      tax_fees_cents: cents(value.taxFees),
      total_cents: computed.totalCents,
      amount_paid_cents: computed.amountPaidCents,
      payment_method: value.paymentMethod,
      payment_status: computed.paymentStatus,
      product_collection: value.productCollection,
      receipt_url: value.receiptUrl,
      notes: value.notes,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;

    return Response.json({ id, expenseNumber }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the expense details and try again." }, { status: 400 });
    if (isUniqueViolation(error)) return Response.json({ error: "That expense number already exists." }, { status: 409 });
    console.error("Failed to save expense", error);
    return Response.json({ error: "The expense could not be saved." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = z.object({ id: z.string().uuid() }).passthrough().parse(await request.json());
    const value = expensePayload.parse(body);
    const computed = totals(value);

    const { data: previous, error: previousError } = await supabase
      .from("expenses")
      .select("receiptUrl:receipt_url")
      .eq("id", body.id)
      .maybeSingle();
    if (previousError) throw previousError;

    const { error } = await supabase.from("expenses").update({
      expense_date: value.expenseDate,
      expense_number: value.expenseNumber,
      receipt_reference: value.receiptReference,
      vendor: value.vendor,
      expense_type: value.expenseType,
      category: value.category,
      subcategory: value.subcategory,
      description: value.description,
      quantity: value.quantity,
      unit_cost_cents: cents(value.unitCost),
      tax_fees_cents: cents(value.taxFees),
      total_cents: computed.totalCents,
      amount_paid_cents: computed.amountPaidCents,
      payment_method: value.paymentMethod,
      payment_status: computed.paymentStatus,
      product_collection: value.productCollection,
      receipt_url: value.receiptUrl,
      notes: value.notes,
      updated_at: new Date().toISOString(),
    }).eq("id", body.id);
    if (error) throw error;

    if (previous?.receiptUrl && previous.receiptUrl !== value.receiptUrl) await deleteReceipt(previous.receiptUrl);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the expense details and try again." }, { status: 400 });
    if (isUniqueViolation(error)) return Response.json({ error: "That expense number already exists." }, { status: 409 });
    console.error("Failed to update expense", error);
    return Response.json({ error: "The expense could not be updated." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
    const supabase = getSupabaseAdmin();
    const { data: previous, error: previousError } = await supabase
      .from("expenses")
      .select("receiptUrl:receipt_url")
      .eq("id", id)
      .maybeSingle();
    if (previousError) throw previousError;

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;

    if (previous?.receiptUrl) await deleteReceipt(previous.receiptUrl);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid expense." }, { status: 400 });
    console.error("Failed to delete expense", error);
    return Response.json({ error: "The expense could not be deleted." }, { status: 503 });
  }
}
