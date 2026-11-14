import { NextResponse } from "next/server";
import { dispatchProtocol, validateSubpath } from "@/lib/protocol-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024 * 1024;

async function handle(req: Request, method: "GET" | "POST" | "PUT", segments: string[]) {
  if (!segments.length || !validateSubpath(segments)) {
    return NextResponse.json({ error: "Invalid protocol endpoint path" }, { status: 400 });
  }
  const url = new URL(req.url);
  const port = url.searchParams.get("nodePort") || url.searchParams.get("XTransformPort") || "3030";

  let body: Record<string, unknown> = {};
  if (method !== "GET") {
    const ctype = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (ctype && ctype !== "application/json") {
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY) {
      return NextResponse.json({ error: "Payload exceeds 8MB cap" }, { status: 413 });
    }
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return NextResponse.json({ error: "JSON body must be an object" }, { status: 400 });
        }
        body = parsed as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
      }
    }
  }

  const res = await dispatchProtocol(method, segments.join("/"), {
    query: url.searchParams,
    body,
    port,
  });
  return NextResponse.json(res.data, {
    status: res.status,
    headers: { "X-Protocol-Engine": res.engineMode },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(req, "GET", (await params).path);
}

export async function POST(req: Request, { params }: Ctx) {
  return handle(req, "POST", (await params).path);
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(req, "PUT", (await params).path);
}
