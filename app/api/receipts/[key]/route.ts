import { getSupabaseAdmin, RECEIPTS_BUCKET } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const match = key.match(/^receipt-[0-9a-f-]+\.(jpg|png|webp)$/);
    if (!match) return new Response("Not found", { status: 404 });

    const { data, error } = await getSupabaseAdmin().storage.from(RECEIPTS_BUCKET).download(key);
    if (error) {
      if ((error as { statusCode?: string | number }).statusCode === 404) return new Response("Not found", { status: 404 });
      throw error;
    }

    return new Response(await data.arrayBuffer(), {
      headers: {
        "Content-Type": data.type || contentTypes[match[1]] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("Failed to load receipt", error);
    return new Response("Receipt unavailable", { status: 503 });
  }
}
