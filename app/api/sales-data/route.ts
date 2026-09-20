import { z } from "zod";

import { getSupabaseAdmin, isUniqueViolation } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const productPayload = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(100).optional().default(""),
  cost: z.coerce.number().min(0).max(100000000),
  sellingPrice: z.coerce.number().min(0).max(100000000),
  stockQuantity: z.coerce.number().int().min(0).max(1000000),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000000),
});

const orderPayload = z.object({
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  orderNumber: z.string().trim().max(80).optional().default(""),
  customerName: z.string().trim().max(160).optional().default(""),
  salesChannel: z.string().trim().min(1).max(80),
  orderStatus: z.enum(["Pending", "Processing", "Shipped", "Completed", "Cancelled"]),
  paymentStatus: z.enum(["Unpaid", "Partial", "Paid"]),
  paymentMethod: z.string().trim().min(1).max(80),
  shippingMethod: z.string().trim().max(100).optional().default(""),
  discount: z.coerce.number().min(0).max(100000000).default(0),
  shippingFee: z.coerce.number().min(0).max(100000000).default(0),
  transactionFee: z.coerce.number().min(0).max(100000000).default(0),
  amountPaid: z.coerce.number().min(0).max(100000000).default(0),
  notes: z.string().trim().max(600).optional().default(""),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().int().positive().max(100000),
    unitPrice: z.coerce.number().min(0).max(100000000),
  })).min(1).max(50),
});

type OrderPayload = z.infer<typeof orderPayload>;

type PreparedItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  variant: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  lineTotalCents: number;
};

function cents(value: number) { return Math.round(value * 100); }
function rangeForMonth(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const now = new Date();
    return rangeForMonth(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const month = `${match[1]}-${match[2]}`;
  return { month, start: `${month}-01`, end: new Date(Date.UTC(Number(match[1]), Number(match[2]), 1)).toISOString().slice(0, 10) };
}
function rangeForRequest(url: URL) {
  if (url.searchParams.get("range") === "all") {
    return { month: "all", start: null as string | null, end: null as string | null };
  }

  const exactDate = url.searchParams.get("date");
  if (exactDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const inclusiveEnd = new Date(`${exactDate}T00:00:00Z`);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
    return {
      month: exactDate.slice(0, 7),
      start: exactDate,
      end: inclusiveEnd.toISOString().slice(0, 10),
    };
  }

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from?.match(/^\d{4}-\d{2}-\d{2}$/) && to?.match(/^\d{4}-\d{2}-\d{2}$/) && from <= to) {
    const inclusiveEnd = new Date(`${to}T00:00:00Z`);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
    return { month: from.slice(0, 7), start: from, end: inclusiveEnd.toISOString().slice(0, 10) };
  }
  return rangeForMonth(url.searchParams.get("month"));
}
function fulfilled(status: string) { return status === "Shipped" || status === "Completed"; }

async function prepareOrder(value: OrderPayload) {
  const supabase = getSupabaseAdmin();
  const productIds = Array.from(new Set(value.items.map((entry) => entry.productId)));
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, sku, variant, costCents:cost_cents, stockQuantity:stock_quantity")
    .in("id", productIds);
  if (error) throw error;

  const byId = new Map((products ?? []).map((product) => [product.id, product]));
  const items: PreparedItem[] = value.items.map((entry) => {
    const product = byId.get(entry.productId);
    if (!product) throw new Error("A selected product no longer exists.");
    const unitPriceCents = cents(entry.unitPrice);
    return {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      variant: product.variant,
      quantity: entry.quantity,
      unitPriceCents,
      unitCostCents: Number(product.costCents),
      lineTotalCents: unitPriceCents * entry.quantity,
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const discountCents = Math.min(cents(value.discount), subtotalCents);
  const shippingFeeCents = cents(value.shippingFee);
  const transactionFeeCents = cents(value.transactionFee);
  const totalCents = Math.max(subtotalCents - discountCents + shippingFeeCents, 0);
  const amountPaidCents = value.paymentStatus === "Paid" ? totalCents : value.paymentStatus === "Unpaid" ? 0 : Math.min(cents(value.amountPaid), totalCents);
  return { items, subtotalCents, discountCents, shippingFeeCents, transactionFeeCents, totalCents, netSalesCents: Math.max(totalCents - transactionFeeCents, 0), amountPaidCents };
}

function rpcItems(items: PreparedItem[]) {
  return items.map((item) => ({
    id: item.id,
    product_id: item.productId,
    product_name: item.productName,
    sku: item.sku,
    variant: item.variant,
    quantity: item.quantity,
    unit_price_cents: item.unitPriceCents,
    unit_cost_cents: item.unitCostCents,
    line_total_cents: item.lineTotalCents,
  }));
}

function orderRow(value: OrderPayload, prepared: Awaited<ReturnType<typeof prepareOrder>>, orderNumber: string, id?: string) {
  const now = new Date().toISOString();
  return {
    ...(id ? { id } : {}),
    order_date: value.orderDate,
    order_number: orderNumber,
    external_order_id: "",
    source: "Manual",
    customer_name: value.customerName,
    sales_channel: value.salesChannel,
    order_status: value.orderStatus,
    payment_status: value.paymentStatus,
    payment_method: value.paymentMethod,
    shipping_method: value.shippingMethod,
    items_summary: prepared.items.map((item) => `${item.quantity}× ${item.productName}${item.variant ? ` (${item.variant})` : ""}`).join(", "),
    subtotal_cents: prepared.subtotalCents,
    discount_cents: prepared.discountCents,
    shipping_fee_cents: prepared.shippingFeeCents,
    transaction_fee_cents: prepared.transactionFeeCents,
    total_cents: prepared.totalCents,
    net_sales_cents: prepared.netSalesCents,
    amount_paid_cents: prepared.amountPaidCents,
    inventory_applied: fulfilled(value.orderStatus) ? 1 : 0,
    notes: value.notes,
    paid_at: value.paymentStatus === "Paid" ? now : "",
    delivered_at: value.orderStatus === "Completed" ? now : "",
    created_at: now,
    updated_at: now,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { month, start, end } = rangeForRequest(new URL(request.url));

    let ordersQuery = supabase.from("sales_orders").select(`
      id, orderDate:order_date, orderNumber:order_number, externalOrderId:external_order_id,
      source, customerName:customer_name, salesChannel:sales_channel, orderStatus:order_status,
      paymentStatus:payment_status, paymentMethod:payment_method, shippingMethod:shipping_method,
      itemsSummary:items_summary, subtotalCents:subtotal_cents, discountCents:discount_cents,
      shippingFeeCents:shipping_fee_cents, transactionFeeCents:transaction_fee_cents,
      totalCents:total_cents, netSalesCents:net_sales_cents, amountPaidCents:amount_paid_cents,
      inventoryApplied:inventory_applied, notes, paidAt:paid_at, deliveredAt:delivered_at,
      createdAt:created_at, updatedAt:updated_at
    `);

    let expensesQuery = supabase
      .from("expenses")
      .select("category, totalCents:total_cents, amountPaidCents:amount_paid_cents");

    if (start && end) {
      ordersQuery = ordersQuery.gte("order_date", start).lt("order_date", end);
      expensesQuery = expensesQuery.gte("expense_date", start).lt("expense_date", end);
    }

    const [ordersResult, productsResult, expensesResult, movementsResult] = await Promise.all([
      ordersQuery.order("order_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("products").select(`
        id, name, sku, variant, costCents:cost_cents, sellingPriceCents:selling_price_cents,
        stockQuantity:stock_quantity, lowStockThreshold:low_stock_threshold,
        createdAt:created_at, updatedAt:updated_at
      `).order("name").order("variant"),
      expensesQuery,
      supabase.from("inventory_movements").select("id, productId:product_id, orderId:order_id, movementType:movement_type, quantityDelta:quantity_delta, reason, createdAt:created_at").order("created_at", { ascending: false }).limit(80),
    ]);

    if (ordersResult.error) {
      throw new Error(`sales_orders: ${ordersResult.error.message}`);
    }
    if (productsResult.error) {
      throw new Error(`products: ${productsResult.error.message}`);
    }
    if (expensesResult.error) {
      throw new Error(`expenses: ${expensesResult.error.message}`);
    }
    if (movementsResult.error) {
      throw new Error(`inventory_movements: ${movementsResult.error.message}`);
    }

    const orders = ordersResult.data ?? [];
    let items: unknown[] = [];
    if (orders.length) {
      const { data, error } = await supabase.from("sales_items").select(`
        id, orderId:order_id, productId:product_id, productName:product_name, sku, variant,
        quantity, unitPriceCents:unit_price_cents, unitCostCents:unit_cost_cents, lineTotalCents:line_total_cents
      `).in("order_id", orders.map((order) => order.id)).order("id");
      if (error) {
        throw new Error(`sales_items: ${error.message}`);
      }
      items = data ?? [];
    }

    const products = productsResult.data ?? [];
    const productMap = new Map(products.map((product) => [product.id, product]));
    const movements = (movementsResult.data ?? []).map((movement) => ({
      ...movement,
      productName: productMap.get(movement.productId)?.name ?? "Deleted product",
      sku: productMap.get(movement.productId)?.sku ?? "",
    }));

    return Response.json({ month, orders, items, products, expenses: expensesResult.data ?? [], movements });
  } catch (error) {
    console.error("Failed to load sales data", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Sales data is temporarily unavailable.";

    return Response.json(
      { error: `Couldn’t load sales data: ${message}` },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = z.object({ resource: z.enum(["product", "order", "inventory"]) }).passthrough().parse(await request.json());
    const now = new Date().toISOString();

    if (body.resource === "product") {
      const value = productPayload.parse(body);
      const id = crypto.randomUUID();
      const { error } = await supabase.from("products").insert({
        id,
        name: value.name,
        sku: value.sku,
        variant: value.variant,
        cost_cents: cents(value.cost),
        selling_price_cents: cents(value.sellingPrice),
        stock_quantity: value.stockQuantity,
        low_stock_threshold: value.lowStockThreshold,
        created_at: now,
        updated_at: now,
      });
      if (error) throw error;

      if (value.stockQuantity) {
        const { error: movementError } = await supabase.from("inventory_movements").insert({
          id: crypto.randomUUID(), product_id: id, order_id: null, movement_type: "Stock In",
          quantity_delta: value.stockQuantity, reason: "Initial stock", created_at: now,
        });
        if (movementError) {
          await supabase.from("products").delete().eq("id", id);
          throw movementError;
        }
      }
      return Response.json({ id }, { status: 201 });
    }

    if (body.resource === "inventory") {
      const value = z.object({ productId: z.string().uuid(), quantityDelta: z.coerce.number().int().refine((number) => number !== 0), reason: z.string().trim().min(1).max(240) }).parse(body);
      const { data, error } = await supabase.rpc("pa_adjust_inventory", {
        p_product_id: value.productId,
        p_quantity_delta: value.quantityDelta,
        p_reason: value.reason,
      });
      if (error) throw error;
      return Response.json({ stockQuantity: data });
    }

    const value = orderPayload.parse(body);
    const prepared = await prepareOrder(value);
    const id = crypto.randomUUID();
    const orderNumber = value.orderNumber || `PA-SALE-${value.orderDate.replaceAll("-", "")}-${id.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
    const { error } = await supabase.rpc("pa_create_order", {
      p_order: orderRow(value, prepared, orderNumber, id),
      p_items: rpcItems(prepared.items),
    });
    if (error) throw error;
    return Response.json({ id, orderNumber }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the details and try again." }, { status: 400 });
    if (isUniqueViolation(error)) return Response.json({ error: "That SKU or order number already exists." }, { status: 409 });
    console.error("Failed to save sales data", error);
    return Response.json({ error: error instanceof Error ? error.message : "The record could not be saved." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = z.object({ resource: z.enum(["product", "order"]), id: z.string().uuid() }).passthrough().parse(await request.json());
    const now = new Date().toISOString();

    if (body.resource === "product") {
      const value = productPayload.omit({ stockQuantity: true }).parse(body);
      const { error } = await supabase.from("products").update({
        name: value.name,
        sku: value.sku,
        variant: value.variant,
        cost_cents: cents(value.cost),
        selling_price_cents: cents(value.sellingPrice),
        low_stock_threshold: value.lowStockThreshold,
        updated_at: now,
      }).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const value = orderPayload.parse(body);
    const prepared = await prepareOrder(value);
    const { data: previous, error: previousError } = await supabase.from("sales_orders").select("orderNumber:order_number").eq("id", body.id).maybeSingle();
    if (previousError) throw previousError;
    if (!previous) return Response.json({ error: "Sale not found." }, { status: 404 });

    const orderNumber = value.orderNumber || previous.orderNumber;
    const row = orderRow(value, prepared, orderNumber);
    row.updated_at = now;

    const { error } = await supabase.rpc("pa_update_order", {
      p_order_id: body.id,
      p_order: row,
      p_items: rpcItems(prepared.items),
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the details and try again." }, { status: 400 });
    if (isUniqueViolation(error)) return Response.json({ error: "That SKU or order number already exists." }, { status: 409 });
    console.error("Failed to update sales data", error);
    return Response.json({ error: error instanceof Error ? error.message : "The record could not be updated." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const resource = z.enum(["product", "order"]).parse(url.searchParams.get("resource"));
    const id = z.string().uuid().parse(url.searchParams.get("id"));

    if (resource === "product") {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const { error } = await supabase.rpc("pa_delete_order", { p_order_id: id });
    if (error) {
      if (error.message.includes("Sale not found")) return Response.json({ error: "Sale not found." }, { status: 404 });
      throw error;
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request." }, { status: 400 });
    console.error("Failed to delete sales data", error);
    return Response.json({ error: "The record could not be deleted." }, { status: 503 });
  }
}
