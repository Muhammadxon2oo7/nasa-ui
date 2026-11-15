import { ValidationError } from "@/server/analyze";
import { compare } from "@/server/compare";
import type { CompareRequest } from "@/types/api";

export const maxDuration = 240;

export async function POST(req: Request) {
  let body: CompareRequest;
  try {
    body = (await req.json()) as CompareRequest;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!Array.isArray(body.places) || body.places.length < 2 || body.places.length > 4) return Response.json({ error: "need_2_to_4_places" }, { status: 400 });
  if (!["winter_wheat", "cotton", "alfalfa", "pasture", "general"].includes(body.goal)) return Response.json({ error: "bad_goal" }, { status: 400 });
  try {
    return Response.json(await compare(body));
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 422 });
    return Response.json({ error: "upstream", message: (e as Error).message }, { status: 502 });
  }
}
