import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCollectorServer } from "./access-request-collector.mjs";

function signedHeaders(secret, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    "content-type": "application/json",
    "x-aelix-timestamp": timestamp,
    "x-aelix-signature": `sha256=${digest}`,
  };
}

test("collector persists signed access requests and rejects unsigned writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aelix-access-"));
  const secret = "test-secret";
  const admin = "test-admin";
  const file = join(dir, "access-requests.jsonl");
  const previous = {
    ACCESS_REQUEST_COLLECTOR_SECRET: process.env.ACCESS_REQUEST_COLLECTOR_SECRET,
    ACCESS_ADMIN_TOKEN: process.env.ACCESS_ADMIN_TOKEN,
    ACCESS_REQUEST_DATA_FILE: process.env.ACCESS_REQUEST_DATA_FILE,
  };

  process.env.ACCESS_REQUEST_COLLECTOR_SECRET = secret;
  process.env.ACCESS_ADMIN_TOKEN = admin;
  process.env.ACCESS_REQUEST_DATA_FILE = file;

  const server = createCollectorServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const record = {
      id: "AELIX-TEST0001",
      lane: "wallet-preorder",
      wallet: "0x000000000000000000000000000000000000dEaD",
      email: "test@example.com",
      persona: "builder",
      telegram: "@test",
      intent: "test",
      acknowledged: "beta, unaudited, no track record, not investment advice",
      createdAt: new Date().toISOString(),
    };
    const body = JSON.stringify(record);

    const unsigned = await fetch(`${base}/access-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(unsigned.status, 401);

    const signed = await fetch(`${base}/access-request`, {
      method: "POST",
      headers: signedHeaders(secret, body),
      body,
    });
    assert.equal(signed.status, 200);
    assert.deepEqual(await signed.json(), { ok: true, id: record.id });

    const raw = await readFile(file, "utf8");
    assert.equal(JSON.parse(raw.trim()).wallet, record.wallet);

    const listed = await fetch(`${base}/access-requests`, {
      headers: { authorization: `Bearer ${admin}` },
    });
    const data = await listed.json();
    assert.equal(listed.status, 200);
    assert.equal(data.count, 1);
    assert.equal(data.requests[0].id, record.id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
