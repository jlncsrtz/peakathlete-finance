import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ENSTACK_HEADERS = [

  "Created At",

  "Order ID",

  "Status",

  "Orders",

  "Shipping Method",

  "Mode of Payment",

  "Sub-total",

  "Shipping Fee",

  "Enstack Subsidy",

  "Voucher Discount",

  "Cashier Discount",

  "Transaction Fee",

  "Total Order Amount",

  "Enstack Shipping Fee",

  "Enstack Transaction Fee",

  "Enstack Commission",

  "Total Sales",

  "Order notes",

  "Date Paid",

  "Pickup Date",

  "Date Delivered",

] as const;

const EXPECTED_KEYS = ENSTACK_HEADERS.map(headerKey);

const EXPECTED_KEY_SET = new Set(EXPECTED_KEYS);

function headerKey(value: string) {

  return value

    .replace(/^\uFEFF/, "")

    .replace(/\u0000/g, "")

    .trim()

    .toLowerCase()

    .replace(/[^a-z0-9]/g, "");

}

function decodeReport(buffer: ArrayBuffer) {

  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {

    return new TextDecoder("utf-16le").decode(bytes);

  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {

    return new TextDecoder("utf-16be").decode(bytes);

  }

  const sampleLength = Math.min(bytes.length, 4000);

  let evenNulls = 0;

  let oddNulls = 0;

  for (let index = 0; index < sampleLength; index += 1) {

    if (bytes[index] !== 0) continue;

    if (index % 2 === 0) evenNulls += 1;

    else oddNulls += 1;

  }

  if (oddNulls > 20 && oddNulls > evenNulls * 3) {

    return new TextDecoder("utf-16le").decode(bytes);

  }

  if (evenNulls > 20 && evenNulls > oddNulls * 3) {

    return new TextDecoder("utf-16be").decode(bytes);

  }

  return new TextDecoder("utf-8").decode(bytes);

}

function parseDelimited(text: string, delimiter: string) {

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

function scoreHeaderRow(row: string[]) {

  const keys = row.map(headerKey);

  return keys.filter((key) => EXPECTED_KEY_SET.has(key)).length;

}

function looksLikeDataRow(row: string[]) {

  if (row.length < ENSTACK_HEADERS.length) return false;

  const createdAt = row[0]?.trim() ?? "";

  const orderId = row[1]?.trim() ?? "";

  if (!createdAt || !orderId) return false;

  // Enstack can export dates in several forms, including values such as

  // "Sep 18, 2026 4:30 PM". Do not require only numeric YYYY-MM-DD dates.

  const parsedDate = Date.parse(createdAt);

  const numericDate = /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(createdAt);

  return numericDate || !Number.isNaN(parsedDate);

}

function looksLikeEnstackWidth(row: string[]) {

  // The user-provided Enstack Sales Report layout contains exactly 21 columns.

  // We also accept extra trailing columns so future Enstack exports remain importable.

  return row.length >= ENSTACK_HEADERS.length;

}

function findEnstackTable(text: string) {

  const delimiters = [",", "\t", ";", "|"];

  let best: {

    rows: string[][];

    headerIndex: number;

    matchCount: number;

    delimiter: string;

  } | null = null;

  for (const delimiter of delimiters) {

    const rows = parseDelimited(text, delimiter);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {

      const matchCount = scoreHeaderRow(rows[rowIndex]);

      if (!best || matchCount > best.matchCount) {

        best = { rows, headerIndex: rowIndex, matchCount, delimiter };

      }

      if (matchCount === ENSTACK_HEADERS.length) {

        return {

          rows,

          headerIndex: rowIndex,

          headers: rows[rowIndex].map((value) => value.trim()),

          positional: false,

        };

      }

    }

    // Some Enstack exports keep the 21-column order while changing/omitting labels.

    // Prefer a 21+ column row followed by a 21+ column sales row. This avoids

    // depending on a particular date display format.

    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {

      if (!looksLikeEnstackWidth(rows[rowIndex])) continue;

      if (!looksLikeEnstackWidth(rows[rowIndex + 1])) continue;

      const nextOrderId = rows[rowIndex + 1][1]?.trim() ?? "";

      if (!nextOrderId) continue;

      return {

        rows,

        headerIndex: rowIndex,

        headers: [...ENSTACK_HEADERS],

        positional: true,

      };

    }

    // Headerless CSV fallback: first 21-column row that resembles an order.

    let firstDataIndex = rows.findIndex(looksLikeDataRow);

    if (firstDataIndex < 0) {

      firstDataIndex = rows.findIndex((row) =>

        looksLikeEnstackWidth(row) && Boolean(row[1]?.trim()),

      );

    }

    if (firstDataIndex >= 0) {

      return {

        rows: [ENSTACK_HEADERS as unknown as string[], ...rows.slice(firstDataIndex)],

        headerIndex: 0,

        headers: [...ENSTACK_HEADERS],

        positional: true,

      };

    }

  }

  return best

    ? {

        rows: best.rows,

        headerIndex: best.headerIndex,

        headers: best.rows[best.headerIndex]?.map((value) => value.trim()) ?? [],

        positional: false,

      }

    : { rows: [] as string[][], headerIndex: 0, headers: [] as string[], positional: false };

}

function amount(value: string | undefined) {

  if (!value) return 0;

  const negative = value.includes("(") && value.includes(")");

  const parsed = Number(value.replace(/[^0-9.-]/g, "")) || 0;

  return Math.round((negative ? -Math.abs(parsed) : parsed) * 100);

}

function isoDate(value: string | undefined) {

  const clean = value?.trim();

  if (!clean) return "";

  const ymd = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;

  const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;

  const date = new Date(clean);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);

}

function orderStatus(value: string | undefined) {

  const status = value?.toLowerCase() ?? "";

  if (status.includes("cancel") || status.includes("refund")) return "Cancelled";

  if (status.includes("deliver") || status.includes("complete")) return "Completed";

  if (status.includes("ship") || status.includes("pickup") || status.includes("pick up")) return "Shipped";

  if (status.includes("process") || status.includes("confirm") || status.includes("approve")) return "Processing";

  return "Pending";

}

export async function POST(request: Request) {

  try {

    const form = await request.formData();

    const file = form.get("file");

    if (!(file instanceof File)) {

      return Response.json({ error: "Choose an Enstack CSV report." }, { status: 400 });

    }

    if (!file.name.toLowerCase().endsWith(".csv")) {

      return Response.json({ error: "Upload the CSV version of your Enstack Sales Report." }, { status: 400 });

    }

    if (file.size > 10 * 1024 * 1024) {

      return Response.json({ error: "CSV file must be 10 MB or smaller." }, { status: 400 });

    }

    const text = decodeReport(await file.arrayBuffer());

    const table = findEnstackTable(text);

    const { rows, headerIndex } = table;

    if (rows.length <= headerIndex + 1) {

      return Response.json({ error: "The CSV does not contain sales rows." }, { status: 400 });

    }

    const rawHeaders = table.headers;

    const headers = rawHeaders.map(headerKey);

    const missingHeaders = table.positional

      ? []

      : ENSTACK_HEADERS.filter((_, index) => !headers.includes(EXPECTED_KEYS[index]));

    if (missingHeaders.length) {

      const detected = rawHeaders.filter(Boolean).slice(0, 30);

      return Response.json(

        {

          error: detected.length

            ? `This does not match the Enstack Sales Report format. Detected columns: ${detected.join(", ")}. Missing: ${missingHeaders.join(", ")}.`

            : `This does not match the Enstack Sales Report format. No readable Enstack header was detected.`,

          expectedHeaders: ENSTACK_HEADERS,

          detectedHeaders: detected,

          hint: detected.length

            ? `Detected columns: ${detected.join(", ")}`

            : "No readable header columns were detected. Export the report from Enstack as CSV and upload that file directly.",

        },

        { status: 400 },

      );

    }

    const supabase = getSupabaseAdmin();

    const now = new Date().toISOString();

    let imported = 0;

    let updated = 0;

    let skipped = 0;

    const errors: string[] = [];

    for (let index = headerIndex + 1; index < rows.length; index += 1) {

      const raw = rows[index];

      if (!raw.some((value) => value.trim())) continue;

      const record: Record<string, string> = {};

      headers.forEach((header, position) => {

        record[header] = raw[position]?.trim() ?? "";

      });

      const externalOrderId = record.orderid;

      const orderDate = isoDate(record.createdat);

      if (!externalOrderId || !orderDate) {

        skipped += 1;

        errors.push(`Row ${index + 1}: missing Order ID or date.`);

        continue;

      }

      const status = orderStatus(record.status);

      const paidAt = isoDate(record.datepaid);

      const deliveredAt = isoDate(record.datedelivered);

      const paymentStatus = paidAt || status === "Completed" ? "Paid" : "Unpaid";

      const subtotalCents = amount(record.subtotal);

      const discountCents = Math.max(amount(record.voucherdiscount) + amount(record.cashierdiscount), 0);

      const shippingFeeCents = amount(record.shippingfee);

      const transactionFeeCents = Math.max(

        amount(record.enstacktransactionfee) || amount(record.transactionfee),

        0,

      );

      const totalCents =

        amount(record.totalorderamount) || Math.max(subtotalCents - discountCents + shippingFeeCents, 0);

      const netSalesCents =

        amount(record.totalsales) ||

        Math.max(totalCents - transactionFeeCents - Math.max(amount(record.enstackshippingfee), 0), 0);

      const amountPaidCents = paymentStatus === "Paid" ? totalCents : 0;

      const itemsSummary = record.orders || "Imported Enstack order";

      const id = crypto.randomUUID();

      const { data, error } = await supabase.rpc("pa_import_enstack_order", {

        p_order: {

          id,

          order_date: orderDate,

          external_order_id: externalOrderId,

          order_status: status,

          payment_status: paymentStatus,

          payment_method: record.modeofpayment || "Enstack",

          shipping_method: record.shippingmethod || "",

          items_summary: itemsSummary,

          subtotal_cents: subtotalCents,

          discount_cents: discountCents,

          shipping_fee_cents: shippingFeeCents,

          transaction_fee_cents: transactionFeeCents,

          total_cents: totalCents,

          net_sales_cents: netSalesCents,

          amount_paid_cents: amountPaidCents,

          notes: record.ordernotes || "",

          paid_at: paidAt,

          delivered_at: deliveredAt,

          created_at: now,

          updated_at: now,

        },

        p_item: {

          id: crypto.randomUUID(),

          product_name: itemsSummary.slice(0, 240),

          unit_price_cents: subtotalCents,

          line_total_cents: subtotalCents,

        },

      });

      if (error) {

        if (error.message.includes("manual_conflict")) {

          skipped += 1;

          errors.push(`Order ${externalOrderId}: already exists as a manual sale.`);

          continue;

        }

        skipped += 1;

        errors.push(`Order ${externalOrderId}: ${error.message}`);

        continue;

      }

      if ((data as { action?: string } | null)?.action === "updated") updated += 1;

      else imported += 1;

    }

    return Response.json({ imported, updated, skipped, errors: errors.slice(0, 12) });

  } catch (error) {

    console.error("Failed to import Enstack sales", error);

    return Response.json({ error: "The Enstack report could not be imported." }, { status: 503 });

  }

}