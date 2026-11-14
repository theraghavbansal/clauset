import { NextResponse } from "next/server";
import { runProtocolRagChat } from "@/lib/protocol-rag";
import type { SearchMode, ShardId } from "@/lib/protocol-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctype = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (ctype !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  let body: { query?: string; shard?: ShardId | "all"; mode?: SearchMode; device?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (query.length > 4000) {
    return NextResponse.json({ error: "query exceeds 4000 chars" }, { status: 413 });
  }
  const result = await runProtocolRagChat({
    query,
    shard: body.shard ?? "all",
    mode: body.mode ?? "hybrid",
    device: body.device,
  });
  return NextResponse.json(result);
}
