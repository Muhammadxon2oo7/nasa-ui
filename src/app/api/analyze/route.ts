import { analyze, ValidationError } from "@/server/analyze";
import type { AnalyzeRequest } from "@/types/api";

export const maxDuration = 120;

export async function POST(req: Request) {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!Array.isArray(body.priorities) || !body.water || !Array.isArray(body.rotation)) return Response.json({ error: "bad_request" }, { status: 400 });
  body.priorities = body.priorities.slice(0, 3);
  try {
    const demoId = process.env.NODE_ENV !== "production" ? req.headers.get("x-demo-id") : null;
    return Response.json(await analyze(body, demoId && /^demo-[a-z]+$/.test(demoId) ? { fieldId: demoId } : {}));
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 422 });
    return Response.json({ error: "upstream", message: (e as Error).message }, { status: 502 });
  }
}
