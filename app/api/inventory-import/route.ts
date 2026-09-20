import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const REQUIRED_HEADERS = ["Product Name", "Price", "Quantity"] as const;

function key(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseRows(text: string, delimiter: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (quoted) {
      if (character === '"' && normalized[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim()));
}

function findTable(text: string) {
  const expected = REQUIRED_HEADERS.map(key);

  for (const delimiter of [",", "\t", ";", "|"]) {
    const rows = parseRows(text, delimiter);

    for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
      const header = rows[index].map(key);

      if (expected.every((item) => header.includes(item))) {
        return { rows, headerIndex: index, headers: header };
      }
    }
  }

  return null;
}

function parsePrice(value: string) {
  const clean = value.trim().replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function parseQuantity(value: string) {
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function cleanText(value: string) {
  return value
    .replace(/\u00A0/g, " ")
    .replace(/[\u2007\u202F]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalized(value: string) {
  return cleanText(value).toLowerCase();
}

const IMPORT_SIZE_TOKENS = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
] as const;

function splitImportedProductName(name: string, explicitVariant: string) {
  const cleanName = cleanText(name);
  const cleanVariant = cleanText(explicitVariant);

  if (cleanVariant && cleanVariant.toLowerCase() !== "standard") {
    return {
      name: cleanName,
      variant: cleanVariant.toUpperCase(),
    };
  }

  const sizePattern = IMPORT_SIZE_TOKENS.join("|");
  const match = cleanName.match(
    new RegExp(`^(.*?)(?:\\s*[-–—]\\s*|\\s+)(${sizePattern})\\s*$`, "i"),
  );

  if (match?.[1] && match?.[2]) {
    return {
      name: match[1].trim(),
      variant: match[2].toUpperCase(),
    };
  }

  return {
    name: cleanName,
    variant: cleanVariant && cleanVariant.toLowerCase() !== "standard" ? cleanVariant : "",
  };
}

function identity(name: string, variant: string) {
  return `${normalized(name)}::${normalized(variant)}`;
}

function slug(value: string) {
  const clean = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();

  return clean.slice(0, 24) || "PRODUCT";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Choose an inventory CSV or TSV file." }, { status: 400 });
    }

    const filename = file.name.toLowerCase();

    if (!filename.endsWith(".csv") && !filename.endsWith(".tsv")) {
      return Response.json({ error: "Upload a .csv or .tsv inventory file." }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: "Inventory file must be 5 MB or smaller." }, { status: 400 });
    }

    const table = findTable(await file.text());

    if (!table) {
      return Response.json(
        { error: "Invalid Enstack inventory template. Required columns: Product Name, Price, Quantity." },
        { status: 400 },
      );
    }

    const productNameIndex = table.headers.indexOf(key("Product Name"));
    const priceIndex = table.headers.indexOf(key("Price"));
    const quantityIndex = table.headers.indexOf(key("Quantity"));
    const sizeIndex = (() => {
      const size = table.headers.indexOf(key("Size"));
      return size >= 0 ? size : table.headers.indexOf(key("Variant"));
    })();

    const supabase = getSupabaseAdmin();

    const { data: existingProducts, error: productsError } = await supabase
      .from("products")
      .select("id, name, sku, variant, stock_quantity");

    if (productsError) throw productsError;

    type ExistingProduct = {
      id: string;
      name: string;
      sku: string;
      variant: string;
      stock_quantity: number;
    };

    const exactMap = new Map<string, ExistingProduct>();
    const byName = new Map<string, ExistingProduct[]>();

    for (const product of (existingProducts ?? []) as ExistingProduct[]) {
      const canonical = splitImportedProductName(product.name, product.variant ?? "");
      exactMap.set(identity(canonical.name, canonical.variant), product);

      const nameKey = normalized(canonical.name);
      byName.set(nameKey, [...(byName.get(nameKey) ?? []), product]);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const seenInFile = new Set<string>();

    for (let rowIndex = table.headerIndex + 1; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex];

      if (!row.some((value) => value.trim())) continue;

      const rawProductName = cleanText(row[productNameIndex] ?? "");
      const rawVariant = sizeIndex >= 0 ? cleanText(row[sizeIndex] ?? "") : "";
      const canonical = splitImportedProductName(rawProductName, rawVariant);
      const productName = canonical.name;
      const variant = canonical.variant;
      const priceCents = parsePrice(row[priceIndex] ?? "");
      const quantity = parseQuantity(row[quantityIndex] ?? "");

      if (!productName) {
        skipped += 1;
        errors.push(`Row ${rowIndex + 1}: Product Name is required.`);
        continue;
      }

      if (priceCents === null) {
        skipped += 1;
        errors.push(`Row ${rowIndex + 1}: invalid Price for ${productName}${variant ? ` ${variant}` : ""}.`);
        continue;
      }

      if (quantity === null) {
        skipped += 1;
        errors.push(`Row ${rowIndex + 1}: invalid Quantity for ${productName}${variant ? ` ${variant}` : ""}.`);
        continue;
      }

      const nameKey = normalized(productName);

      if (!variant) {
        const existingSameName = byName.get(nameKey) ?? [];
        const hasSizedVariants = existingSameName.some((product) => normalized(product.variant ?? "") !== "");

        if (hasSizedVariants && !exactMap.has(identity(productName, ""))) {
          skipped += 1;
          errors.push(`Row ${rowIndex + 1}: "${productName}" already has sizes. Add a Size column so the correct size can be updated.`);
          continue;
        }
      }

      const rowIdentity = identity(productName, variant);

      if (seenInFile.has(rowIdentity)) {
        skipped += 1;
        errors.push(`Row ${rowIndex + 1}: duplicate "${productName}${variant ? ` / ${variant}` : ""}" in the same file.`);
        continue;
      }

      seenInFile.add(rowIdentity);

      const existing = exactMap.get(rowIdentity);
      const now = new Date().toISOString();

      if (existing) {
        const oldQuantity = Number(existing.stock_quantity ?? 0);
        const quantityDelta = quantity - oldQuantity;

        const { error: updateError } = await supabase
          .from("products")
          .update({
            name: productName,
            variant,
            selling_price_cents: priceCents,
            stock_quantity: quantity,
            updated_at: now,
          })
          .eq("id", existing.id);

        if (updateError) {
          skipped += 1;
          errors.push(`Row ${rowIndex + 1}: ${updateError.message}`);
          continue;
        }

        if (quantityDelta !== 0) {
          const { error: movementError } = await supabase
            .from("inventory_movements")
            .insert({
              id: crypto.randomUUID(),
              product_id: existing.id,
              order_id: null,
              movement_type: "Inventory Import",
              quantity_delta: quantityDelta,
              reason: `Inventory import${variant ? ` · ${variant}` : ""}`,
              created_at: now,
            });

          if (movementError) {
            errors.push(`Row ${rowIndex + 1}: stock updated but movement log failed for ${productName}${variant ? ` ${variant}` : ""}.`);
          }
        }

        existing.stock_quantity = quantity;
        existing.name = productName;
        existing.variant = variant;
        updated += 1;
        continue;
      }

      const id = crypto.randomUUID();
      const variantSlug = variant ? `-${slug(variant)}` : "";
      const sku = `IMP-${slug(productName)}${variantSlug}-${id.replaceAll("-", "").slice(0, 6).toUpperCase()}`;

      const { error: insertError } = await supabase
        .from("products")
        .insert({
          id,
          name: productName,
          sku,
          variant,
          cost_cents: 0,
          selling_price_cents: priceCents,
          stock_quantity: quantity,
          low_stock_threshold: 5,
          created_at: now,
          updated_at: now,
        });

      if (insertError) {
        skipped += 1;
        errors.push(`Row ${rowIndex + 1}: ${insertError.message}`);
        continue;
      }

      if (quantity > 0) {
        const { error: movementError } = await supabase
          .from("inventory_movements")
          .insert({
            id: crypto.randomUUID(),
            product_id: id,
            order_id: null,
            movement_type: "Inventory Import",
            quantity_delta: quantity,
            reason: `Initial inventory import${variant ? ` · ${variant}` : ""}`,
            created_at: now,
          });

        if (movementError) {
          errors.push(`Row ${rowIndex + 1}: product imported but movement log failed for ${productName}${variant ? ` ${variant}` : ""}.`);
        }
      }

      const created: ExistingProduct = {
        id,
        name: productName,
        sku,
        variant,
        stock_quantity: quantity,
      };

      exactMap.set(rowIdentity, created);
      byName.set(nameKey, [...(byName.get(nameKey) ?? []), created]);

      imported += 1;
    }

    return Response.json({
      imported,
      updated,
      skipped,
      errors: errors.slice(0, 12),
    });
  } catch (error) {
    console.error("Failed to import inventory", error);

    return Response.json(
      { error: error instanceof Error ? error.message : "The inventory file could not be imported." },
      { status: 503 },
    );
  }
}
