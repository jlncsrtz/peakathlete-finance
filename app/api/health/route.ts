import { friendlySupabaseError, getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const [expenses, budgets] = await Promise.all([
      supabase.from("expenses").select("id", { count: "exact", head: true }),
      supabase.from("monthly_budgets").select("month", { count: "exact", head: true }),
    ]);

    if (expenses.error) throw expenses.error;
    if (budgets.error) throw budgets.error;

    return Response.json({
      ok: true,
      database: "connected",
      expensesTable: "ready",
      monthlyBudgetsTable: "ready",
    });
  } catch (error) {
    console.error("Supabase health check failed", error);
    return Response.json({
      ok: false,
      database: "not ready",
      error: friendlySupabaseError(error),
    }, { status: 503 });
  }
}
