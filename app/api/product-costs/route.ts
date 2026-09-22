import { z } from "zod";

import {
  friendlySupabaseError,
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const variantSchema = z
  .array(z.string().trim().min(1).max(80))
  .min(1)
  .max(50);

const itemCostSchema = z.object({
  id: z.string().min(1).max(100),
  item: z.string().max(120),
  costPerUnit: z.number().min(0).max(10000000),
  note: z.string().max(500),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createProduct"),
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("updateProduct"),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("createItem"),
    productId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    variants: variantSchema,
  }),
  z.object({
    action: z.literal("updateItem"),
    id: z.string().uuid(),
    productId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    variants: variantSchema,
  }),
  z.object({
    action: z.literal("saveSheet"),
    productId: z.string().uuid(),
    itemId: z.string().uuid(),
    variant: z.string().trim().min(1).max(80),
    sellingPrice: z.number().min(0).max(10000000),
    commissionRate: z.number().min(0).max(100),
    taxRate: z.number().min(0).max(100),
    opexRate: z.number().min(0).max(100),
    items: z.array(itemCostSchema).max(100),
  }),
]);

const productSelect = `
  id,
  name,
  createdAt:created_at
`;

const itemSelect = `
  id,
  productId:product_id,
  name,
  variants,
  createdAt:created_at
`;

const sheetSelect = `
  productId:product_id,
  productName:product_name,
  itemId:item_id,
  itemName:item_name,
  variant,
  sellingPrice:selling_price,
  commissionRate:commission_rate,
  taxRate:tax_rate,
  opexRate:opex_rate,
  items
`;

async function getProduct(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("product_cost_products")
    .select(productSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getItem(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("product_cost_items")
    .select(itemSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function canonicalVariant(
  item: { variants: string[] },
  variant: string,
) {
  return item.variants.find(
    (entry) => entry.toLowerCase() === variant.toLowerCase(),
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "catalog";
    const supabase = getSupabaseAdmin();

    if (mode === "catalog") {
      const [
        { data: products, error: productError },
        { data: items, error: itemError },
      ] = await Promise.all([
        supabase
          .from("product_cost_products")
          .select(productSelect)
          .order("created_at", { ascending: true }),

        supabase
          .from("product_cost_items")
          .select(itemSelect)
          .order("created_at", { ascending: true }),
      ]);

      if (productError) throw productError;
      if (itemError) throw itemError;

      return Response.json({
        products: products ?? [],
        items: items ?? [],
      });
    }

    if (mode === "sheet") {
      const productId = z
        .string()
        .uuid()
        .parse(url.searchParams.get("productId"));

      const itemId = z
        .string()
        .uuid()
        .parse(url.searchParams.get("itemId"));

      const variant = z
        .string()
        .trim()
        .min(1)
        .max(80)
        .parse(url.searchParams.get("variant"));

      const [product, item] = await Promise.all([
        getProduct(productId),
        getItem(itemId),
      ]);

      if (!product || !item || item.productId !== productId) {
        return Response.json(
          { error: "Product item not found." },
          { status: 404 },
        );
      }

      const cleanVariant = canonicalVariant(item, variant);

      if (!cleanVariant) {
        return Response.json(
          { error: "Variant not found." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("product_cost_sheets")
        .select(sheetSelect)
        .eq("product_id", productId)
        .eq("item_id", itemId)
        .eq("variant", cleanVariant)
        .maybeSingle();

      if (error) throw error;

      return Response.json({ sheet: data ?? null });
    }

    return Response.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid product costs request." },
        { status: 400 },
      );
    }

    console.error("Product costs GET failed", error);

    return Response.json(
      { error: friendlySupabaseError(error) },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const value = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (value.action === "createProduct") {
      const { error } = await supabase
        .from("product_cost_products")
        .insert({
          name: value.name,
          created_at: now,
          updated_at: now,
        });

      if (error) throw error;

      return Response.json({ ok: true }, { status: 201 });
    }

    if (value.action === "updateProduct") {
      const { error } = await supabase
        .from("product_cost_products")
        .update({
          name: value.name,
          updated_at: now,
        })
        .eq("id", value.id);

      if (error) throw error;

      const { error: sheetError } = await supabase
        .from("product_cost_sheets")
        .update({
          product_name: value.name,
          updated_at: now,
        })
        .eq("product_id", value.id);

      if (sheetError) throw sheetError;

      return Response.json({ ok: true });
    }

    if (value.action === "createItem") {
      const product = await getProduct(value.productId);

      if (!product) {
        return Response.json(
          { error: "Product not found." },
          { status: 404 },
        );
      }

      const { error } = await supabase
        .from("product_cost_items")
        .insert({
          product_id: value.productId,
          name: value.name,
          variants: value.variants,
          created_at: now,
          updated_at: now,
        });

      if (error) throw error;

      return Response.json({ ok: true }, { status: 201 });
    }

    if (value.action === "updateItem") {
      const previous = await getItem(value.id);

      if (!previous || previous.productId !== value.productId) {
        return Response.json(
          { error: "Item not found." },
          { status: 404 },
        );
      }

      const { error } = await supabase
        .from("product_cost_items")
        .update({
          name: value.name,
          variants: value.variants,
          updated_at: now,
        })
        .eq("id", value.id);

      if (error) throw error;

      const { error: renameError } = await supabase
        .from("product_cost_sheets")
        .update({
          item_name: value.name,
          updated_at: now,
        })
        .eq("item_id", value.id);

      if (renameError) throw renameError;

      const removedVariants = previous.variants.filter(
        (oldVariant: string) =>
          !value.variants.some(
            (nextVariant) =>
              nextVariant.toLowerCase() === oldVariant.toLowerCase(),
          ),
      );

      if (removedVariants.length) {
        const { error: removeError } = await supabase
          .from("product_cost_sheets")
          .delete()
          .eq("item_id", value.id)
          .in("variant", removedVariants);

        if (removeError) throw removeError;
      }

      return Response.json({ ok: true });
    }

    const [product, item] = await Promise.all([
      getProduct(value.productId),
      getItem(value.itemId),
    ]);

    if (!product || !item || item.productId !== product.id) {
      return Response.json(
        { error: "Product item not found." },
        { status: 404 },
      );
    }

    const cleanVariant = canonicalVariant(item, value.variant);

    if (!cleanVariant) {
      return Response.json(
        { error: "Variant not found." },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("product_cost_sheets")
      .upsert(
        {
          product_id: product.id,
          product_name: product.name,
          item_id: item.id,
          item_name: item.name,
          variant: cleanVariant,
          selling_price: value.sellingPrice,
          commission_rate: value.commissionRate,
          tax_rate: value.taxRate,
          opex_rate: value.opexRate,
          items: value.items,
          updated_at: now,
        },
        {
          onConflict: "item_id,variant",
        },
      );

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Check the product cost fields." },
        { status: 400 },
      );
    }

    console.error("Product costs POST failed", error);

    return Response.json(
      { error: friendlySupabaseError(error) },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const id = z.string().uuid().parse(url.searchParams.get("id"));
    const supabase = getSupabaseAdmin();

    if (mode === "product") {
      const { error } = await supabase
        .from("product_cost_products")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return Response.json({ ok: true });
    }

    if (mode === "item") {
      const { error } = await supabase
        .from("product_cost_items")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return Response.json({ ok: true });
    }

    return Response.json(
      { error: "Invalid delete request." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid record." },
        { status: 400 },
      );
    }

    console.error("Product costs DELETE failed", error);

    return Response.json(
      { error: friendlySupabaseError(error) },
      { status: 503 },
    );
  }
}
