import { MODELS } from "@/data/models";

export function GET() {
  return Response.json(MODELS);
}
