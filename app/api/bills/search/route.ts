import { getPipeline, searchBills } from "@/lib/sources/pipeline";

// Bill search for the tracker. The full list stays on the server so that every
// visitor doesn't download thousands of bills sitting in committee.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 2) return Response.json({ results: [] });
  const { bills } = await getPipeline();
  return Response.json({ results: searchBills(bills, query) });
}
