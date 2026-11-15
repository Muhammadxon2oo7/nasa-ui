import { cropList } from "@/data/crops";

export function GET() {
  return Response.json(cropList());
}
