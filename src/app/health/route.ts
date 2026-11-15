import { connection } from "next/server";

async function ping(url: string, ms = 6000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  await connection();
  const [power, pc] = await Promise.all([
    ping("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=AG&latitude=41&longitude=64&start=20240101&end=20240102&format=JSON"),
    ping("https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a"),
  ]);
  return Response.json({ gee: pc, power, llm: !!process.env.ANTHROPIC_API_KEY });
}
