import { NextRequest, NextResponse } from "next/server";
import {
  AccessRequestStorageError,
  readAccessRequests,
  writeAccessRequest,
  type AccessRequestRecord,
} from "@/lib/access-request-store";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LANES = new Set(["wallet-preorder", "desk-beta", "vault-preview"]);
const PERSONAS = new Set(["trader", "builder", "fund", "researcher"]);
const WALLET_REQUIRED = new Set(["wallet-preorder", "vault-preview"]);
function cleanText(value: unknown, max = 600) {
  return String(value ?? "").trim().slice(0, max);
}

function requestId(wallet: string, email: string) {
  const seed = `${wallet.toLowerCase()}|${email.toLowerCase()}|${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `AELIX-${hash.toString(16).toUpperCase().padStart(8, "0")}`;
}

function authorized(req: NextRequest) {
  const token = process.env.ACCESS_ADMIN_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return bearer === token;
}

export async function GET(req: NextRequest) {
  if (!process.env.ACCESS_ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "ACCESS_ADMIN_TOKEN is not configured" }, { status: 501 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const requests = await readAccessRequests();
    return NextResponse.json({ ok: true, count: requests.length, requests });
  } catch (error) {
    if (error instanceof AccessRequestStorageError) {
      return NextResponse.json({ ok: false, error: error.publicMessage }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "could not read access requests" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const lane = cleanText(body.lane, 40);
  const wallet = cleanText(body.wallet, 80);
  const email = cleanText(body.email, 200).toLowerCase();
  const persona = cleanText(body.persona, 40);
  const telegram = cleanText(body.telegram, 80);
  const intent = cleanText(body.intent, 1000);
  const consent = Boolean(body.consent);

  if (!LANES.has(lane)) return NextResponse.json({ ok: false, error: "invalid access lane" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "invalid email" }, { status: 400 });
  if (!PERSONAS.has(persona)) return NextResponse.json({ ok: false, error: "invalid persona" }, { status: 400 });
  if (wallet && !EVM_ADDRESS_RE.test(wallet)) return NextResponse.json({ ok: false, error: "invalid EVM wallet" }, { status: 400 });
  if (WALLET_REQUIRED.has(lane) && !EVM_ADDRESS_RE.test(wallet)) {
    return NextResponse.json({ ok: false, error: "wallet required for this lane" }, { status: 400 });
  }
  if (!consent) return NextResponse.json({ ok: false, error: "risk acknowledgement required" }, { status: 400 });

  const record: AccessRequestRecord = {
    id: requestId(wallet, email),
    lane,
    wallet: wallet || null,
    email,
    persona,
    telegram: telegram || null,
    intent: intent || null,
    acknowledged: "beta, unaudited, no track record, not investment advice",
    createdAt: new Date().toISOString(),
  };

  try {
    await writeAccessRequest(record);
  } catch (error) {
    if (error instanceof AccessRequestStorageError) {
      return NextResponse.json({ ok: false, error: error.publicMessage }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "could not save access request" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: record.id });
}
