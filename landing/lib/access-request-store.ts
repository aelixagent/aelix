import { createHmac } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export type AccessRequestRecord = {
  id: string;
  lane: string;
  wallet: string | null;
  email: string;
  persona: string;
  telegram: string | null;
  intent: string | null;
  acknowledged: string;
  createdAt: string;
};

export class AccessRequestStorageError extends Error {
  constructor(
    readonly publicMessage: string,
    readonly status = 503,
  ) {
    super(publicMessage);
    this.name = "AccessRequestStorageError";
  }
}

const DEFAULT_DATA_FILE = ".data/access-requests.jsonl";
const WEBHOOK_TIMEOUT_MS = 8_000;

function dataFile() {
  const configured = process.env.ACCESS_REQUEST_DATA_FILE || DEFAULT_DATA_FILE;
  return isAbsolute(configured) ? configured : join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function isVercel() {
  return Boolean(process.env.VERCEL || process.env.NEXT_RUNTIME === "edge");
}

function webhookSecret() {
  const secret = process.env.ACCESS_REQUEST_WEBHOOK_SECRET;
  if (!secret) {
    throw new AccessRequestStorageError("persistent request webhook secret is not configured");
  }
  return secret;
}

function webhookHeaders(body: string) {
  const secret = webhookSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-aelix-timestamp": timestamp,
  };

  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  headers["x-aelix-signature"] = `sha256=${digest}`;

  return headers;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function writeWebhook(record: AccessRequestRecord, url: string) {
  const body = JSON.stringify(record);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: webhookHeaders(body),
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AccessRequestStorageError(detail || "persistent request backend rejected the write", 502);
  }
}

async function readWebhook(url: string) {
  const body = "";
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: webhookHeaders(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AccessRequestStorageError(detail || "persistent request backend rejected the read", 502);
  }

  const data = (await res.json()) as { requests?: AccessRequestRecord[] };
  return Array.isArray(data.requests) ? data.requests : [];
}

export async function writeAccessRequest(record: AccessRequestRecord) {
  const webhookUrl = process.env.ACCESS_REQUEST_WEBHOOK_URL;
  if (webhookUrl) {
    await writeWebhook(record, webhookUrl);
    return;
  }

  if (isVercel()) {
    throw new AccessRequestStorageError("persistent request storage is not configured");
  }

  const file = dataFile();
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}

export async function readAccessRequests() {
  const webhookReadUrl = process.env.ACCESS_REQUEST_WEBHOOK_READ_URL;
  if (webhookReadUrl) return readWebhook(webhookReadUrl);

  if (isVercel()) {
    throw new AccessRequestStorageError("persistent request storage is not configured");
  }

  try {
    const raw = await readFile(dataFile(), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AccessRequestRecord)
      .reverse();
  } catch {
    return [];
  }
}
