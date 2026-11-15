import { recompute } from "@/server/analyze";

/** C1: GET /api/passport/{placeId} → PassportData */
export async function GET(req: Request, ctx: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await ctx.params;
  const d = await recompute(placeId);
  if (!d) return Response.json({ error: "not_found" }, { status: 404 });
  let h = 2166136261;
  for (const c of placeId) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const no = `FS-${new Date(d.generatedAt).getUTCFullYear()}-${(h >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
  return Response.json({ passportNo: no, issuedAt: d.generatedAt, onlineUrl: `${new URL(req.url).origin}/result/${placeId}`, analysis: d });
}
