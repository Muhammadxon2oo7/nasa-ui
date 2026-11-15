import { backtestAll } from "@/server/backtest";

export const maxDuration = 120;

export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "uz";
  try {
    return Response.json(await backtestAll(lang));
  } catch (e) {
    return Response.json({ error: "backtest_failed", message: (e as Error).message, stack: process.env.NODE_ENV === "development" ? (e as Error).stack?.split("\n").slice(0, 6) : undefined }, { status: 500 });
  }
}
