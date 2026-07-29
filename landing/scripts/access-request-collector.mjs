#!/usr/bin/env node
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const LANES = new Set(["wallet-preorder", "desk-access", "vault-access"]);
const PERSONAS = new Set(["trader", "builder", "fund", "researcher"]);
const DEFAULT_DATA_FILE = ".data/access-requests.jsonl";
const MAX_BODY_BYTES = 64 * 1024;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function dataFile(cwd = process.cwd()) {
  const configured = process.env.ACCESS_REQUEST_DATA_FILE || DEFAULT_DATA_FILE;
  return isAbsolute(configured) ? configured : join(cwd, configured);
}

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function validSignature(req, body = "") {
  const secret = process.env.ACCESS_REQUEST_COLLECTOR_SECRET;
  if (!secret) return false;

  const timestamp = req.headers["x-aelix-timestamp"];
  const signature = req.headers["x-aelix-signature"];
  if (typeof timestamp !== "string" || typeof signature !== "string") return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(signature);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function authorizedAdmin(req) {
  const token = process.env.ACCESS_ADMIN_TOKEN;
  if (!token) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return bearer === token;
}

function validateRecord(record) {
  if (!record || typeof record !== "object") return "invalid request record";
  if (typeof record.id !== "string" || !record.id.startsWith("AELIX-")) return "invalid request id";
  if (!LANES.has(record.lane)) return "invalid access lane";
  if (record.wallet !== null && !EVM_ADDRESS_RE.test(record.wallet || "")) return "invalid EVM wallet";
  if (typeof record.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) return "invalid email";
  if (!PERSONAS.has(record.persona)) return "invalid persona";
  if (typeof record.createdAt !== "string" || Number.isNaN(Date.parse(record.createdAt))) return "invalid createdAt";
  return "";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function appendRecord(record) {
  const file = dataFile();
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}

async function listRecords() {
  try {
    const raw = await readFile(dataFile(), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .reverse();
  } catch {
    return [];
  }
}

export async function handleRequest(req, res) {
  const path = new URL(req.url || "/", "http://localhost").pathname;

  if (req.method === "GET" && path === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && path === "/access-request") {
    const body = await readBody(req);
    if (!validSignature(req, body)) {
      json(res, 401, { ok: false, error: "invalid signature" });
      return;
    }

    let record;
    try {
      record = JSON.parse(body);
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON body" });
      return;
    }

    const error = validateRecord(record);
    if (error) {
      json(res, 400, { ok: false, error });
      return;
    }

    await appendRecord(record);
    json(res, 200, { ok: true, id: record.id });
    return;
  }

  if (req.method === "GET" && path === "/access-requests") {
    if (!authorizedAdmin(req) && !validSignature(req, "")) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const requests = await listRecords();
    json(res, 200, { ok: true, count: requests.length, requests });
    return;
  }

  json(res, 404, { ok: false, error: "not found" });
}

export function createCollectorServer() {
  return createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      json(res, 500, { ok: false, error: error instanceof Error ? error.message : "collector failed" });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const required = ["ACCESS_REQUEST_COLLECTOR_SECRET", "ACCESS_ADMIN_TOKEN"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")}`);
    process.exit(1);
  }

  const port = Number(process.env.PORT || 8787);
  createCollectorServer().listen(port, () => {
    console.log(`AELIX access request collector listening on :${port}`);
    console.log(`Writing requests to ${dataFile()}`);
  });
}
