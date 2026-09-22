import { z } from "zod";

import {
  friendlySupabaseError,
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  id: z.string().min(1).max(100),
  item: z.string().max(120),
  costPerUnit: z.number().min(0).max(10000000),
  note: z.string().max(500),
});

const variantSchema = z
  .array(z.string().trim().min(1).max(80))
  .min(1)
  .max(30)
  .transform((values) => {
    const seen = new Set<string>();

    return values.filter((value) => {
      const key = value.toLowerCase();

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  });

const createProductSchema = z.object({
  action: z.literal("createProduct"),
  name: z.string().trim().min(1).max(120),
  variants: variantSchema,
});

const updateProductSchema = z.object({
  action: z.literal("updateProduct"),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  variants: variantSchema,
});

const saveSheetSchema = z.object({
  action: z.literal("saveSheet"),
  productId: z.string().uuid(),
  variant: z.string().trim().min(1).max(80),
  sellingPrice: z.number().min(0).max(10000000),
  commissionRate: z.number().min(0).max(100),
  taxRate: z.number().min(0).max(100),
  opexRate: z.number().min(0).max(100),
  items: z.array(itemSchema).max(100),
});

const bodySchema = z.discriminatedUnion("action", [
  createProductSchema,
  updateProductSchema,
  saveSheetSchema,
]);

const productSelect = `
  id,
  name,
  variants,
  createdAt:created_at
`;

const sheetSelect = `
  productId:product_id,
  productName:product_name,
  variant,
  sellingPrice:selling_price,
  commissionRate:commission_rate,
  taxRate:tax_rate,
  opexRate:opex_rate,
  items
`;

async function getProduct(productId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("product_cost_products")
    .select(productSelect)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;

  return data as
    | {
        id: string;
        name: string;
        variants: string[];
        createdAt: string;
      }
    | null;
}

function sameVariant(product: { variants: string[] }, variant: string) {
  return product.variants.find(
    (entry) => entry.toLowerCase() === variant.toLowerCase(),
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "catalog";
    const supabase = getSupabaseAdmin();

    if (mode === "catalog") {
      const { data, error } = await supabase
        .from("product_cost_products")
        .select(productSelect)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return Response.json({ products: data ?? [] });
    }

    if (mode === "sheet") {
      const productId = z
        .string()
        .uuid()
        .parse(url.searchParams.get("productId"));

      const variant = z
        .string()
        .trim()
        .min(1)
        .max(80)
        .parse(url.searchParams.get("variant"));

      const product = await getProduct(productId);

      if (!product) {
        return Response.json(
          { error: "Product not found." },
          { status: 404 },
        );
      }

      const canonicalVariant = sameVariant(product, variant);

      if (!canonicalVariant) {
        return Response.json(
          { error: "Variant not found for this product." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("product_cost_sheets")
        .select(sheetSelect)
        .eq("product_id", productId)
        .eq("variant", canonicalVariant)
        .maybeSingle();

      if (error) throw error;

      return Response.json({ sheet: data ?? null });
    }

    return Response.json(
      { error: "Invalid product costs request." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid product costs request." },
        { status: 400 },
      );
    }

    console.error("Failed to load product costs", error);

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
      const { data, error } = await supabase
        .from("product_cost_products")
        .insert({
          name: value.name,
          variants: value.variants,
          created_at: now,
          updated_at: now,
        })
        .select(productSelect)
        .single();

      if (error) throw error;

      return Response.json({ product: data }, { status: 201 });
    }

    if (value.action === "updateProduct") {
      const previous = await getProduct(value.id);

      if (!previous) {
        return Response.json(
          { error: "Product not found." },
          { status: 404 },
        );
      }

      const previousVariants = previous.variants ?? [];

      const { data, error } = await supabase
        .from("product_cost_products")
        .update({
          name: value.name,
          variants: value.variants,
          updated_at: now,
        })
        .eq("id", value.id)
        .select(productSelect)
        .single();

      if (error) throw error;

      // Keep product name synchronized in all existing sheets.
      const { error: renameSheetError } = await supabase
        .from("product_cost_sheets")
        .update({
          product_name: value.name,
          updated_at: now,
        })
        .eq("product_id", value.id);

      if (renameSheetError) throw renameSheetError;

      // Delete sheets for variants that were removed from the product.
      const removedVariants = previousVariants.filter(
        (oldVariant) =>
          !value.variants.some(
            (newVariant) =>
              newVariant.toLowerCase() === oldVariant.toLowerCase(),
          ),
      );

      if (removedVariants.length) {
        const { error: removedSheetError } = await supabase
          .from("product_cost_sheets")
          .delete()
          .eq("product_id", value.id)
          .in("variant", removedVariants);

        if (removedSheetError) throw removedSheetError;
      }

      return Response.json({ product: data });
    }

    const product = await getProduct(value.productId);

    if (!product) {
      return Response.json(
        { error: "Product not found." },
        { status: 404 },
      );
    }

    const canonicalVariant = sameVariant(product, value.variant);

    if (!canonicalVariant) {
      return Response.json(
        { error: "Variant not found for this product." },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("product_cost_sheets")
      .upsert(
        {
          product_id: product.id,
          product_name: product.name,
          variant: canonicalVariant,
          selling_price: value.sellingPrice,
          commission_rate: value.commissionRate,
          tax_rate: value.taxRate,
          opex_rate: value.opexRate,
          items: value.items,
          updated_at: now,
        },
        {
          onConflict: "product_id,variant",
        },
      );

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Check the product cost fields and try again." },
        { status: 400 },
      );
    }

    console.error("Failed to save product costs", error);

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

    if (mode !== "product") {
      return Response.json(
        { error: "Invalid delete request." },
        { status: 400 },
      );
    }

    const id = z.string().uuid().parse(url.searchParams.get("id"));

    const { error } = await getSupabaseAdmin()
      .from("product_cost_products")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid product." },
        { status: 400 },
      );
    }

    console.error("Failed to delete product", error);

    return Response.json(
      { error: friendlySupabaseError(error) },
      { status: 503 },
    );
  }
}
