import type { NextRequest } from "next/server";
import { recompute } from "@/server/analyze";
import { toCsv, toGeoJson } from "@/lib/export";

export async function GET(req: NextRequest, ctx: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await ctx.params;
  if (!/^[a-z0-9-]{3,40}$/i.test(placeId)) return Response.json({ error: "bad_id" }, { status: 400 });
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const d = await recompute(placeId);
  if (!d) return Response.json({ error: "unknown_place" }, { status: 404 });
  const name = `field-shift-${placeId}`;
  if (format === "csv") return new Response(toCsv(d), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
  if (format === "geojson") return new Response(JSON.stringify(toGeoJson(d), null, 2), { headers: { "Content-Type": "application/geo+json", "Content-Disposition": `attachment; filename="${name}.geojson"` } });
  return new Response(JSON.stringify(d, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}.json"` } });
}
