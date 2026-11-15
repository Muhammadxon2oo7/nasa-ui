import { whatIf } from "@/server/analyze";
import type { WhatIfRequest } from "@/types/api";

export async function POST(req: Request) {
  let body: WhatIfRequest;
  try {
    body = (await req.json()) as WhatIfRequest;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (typeof body.fieldId !== "string") return Response.json({ error: "bad_request" }, { status: 400 });
  const r = await whatIf(body);
  if (!r) return Response.json({ error: "unknown_field" }, { status: 404 });
  return Response.json(r);
}
