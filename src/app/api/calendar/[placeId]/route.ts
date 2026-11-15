import { recompute } from "@/server/analyze";
import { toIcs } from "@/lib/ics";

/** B1: GET /api/calendar/{placeId}?format=json|ics */
export async function GET(req: Request, ctx: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await ctx.params;
  const d = await recompute(placeId);
  if (!d?.calendar) return Response.json({ error: "not_found" }, { status: 404 });
  if (new URL(req.url).searchParams.get("format") === "ics") {
    const c = d.calendar;
    const ev = [...c.thisWeek, ...c.next90Days.filter((e) => !c.thisWeek.some((w) => w.id === e.id))];
    return new Response(toIcs(ev, `Field Shift · ${d.field.region ?? placeId}`), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="fieldshift-${placeId}.ics"` } });
  }
  return Response.json(d.calendar);
}
