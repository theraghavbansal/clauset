import { NextResponse } from "next/server";
import { runProtocolIntelligence } from "@/lib/protocol-rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctype = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (ctype !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  let body: { action?: "distill_sop" | "auto_tag"; text?: string; asset_id?: string; sensitivity?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.action !== "distill_sop" && body.action !== "auto_tag") {
    return NextResponse.json({ error: "action must be distill_sop or auto_tag" }, { status: 400 });
  }
  const out = await runProtocolIntelligence({
    action: body.action,
    text: String(body.text ?? ""),
    asset_id: body.asset_id,
    sensitivity: body.sensitivity,
  });
  return NextResponse.json(out.data, { status: out.status });
}
