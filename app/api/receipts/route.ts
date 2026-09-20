import { getSupabaseAdmin, RECEIPTS_BUCKET } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const allowedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const maxBytes = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a receipt image." }, { status: 400 });
    const extension = allowedTypes[file.type];
    if (!extension) return Response.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
    if (file.size > maxBytes) return Response.json({ error: "Receipt image must be 4 MB or smaller." }, { status: 400 });

    const key = `receipt-${crypto.randomUUID()}.${extension}`;
    const { error } = await getSupabaseAdmin().storage.from(RECEIPTS_BUCKET).upload(
      key,
      await file.arrayBuffer(),
      {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
        metadata: { originalName: file.name.slice(0, 180) },
      },
    );
    if (error) throw error;

    return Response.json({ receiptUrl: `/api/receipts/${encodeURIComponent(key)}` }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload receipt", error);
    return Response.json({ error: "The receipt image could not be uploaded." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("key");
    if (!key || !/^receipt-[0-9a-f-]+\.(jpg|png|webp)$/.test(key)) {
      return Response.json({ error: "Invalid receipt image." }, { status: 400 });
    }
    const { error } = await getSupabaseAdmin().storage.from(RECEIPTS_BUCKET).remove([key]);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove receipt", error);
    return Response.json({ error: "The receipt image could not be removed." }, { status: 503 });
  }
}
