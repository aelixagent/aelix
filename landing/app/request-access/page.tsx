"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { VAULT_URL } from "@/lib/links";
import "../vx.css";

const ACCESS_EMAIL = process.env.NEXT_PUBLIC_ACCESS_EMAIL || "access@aelix.xyz";
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ACCESS_WAVE = "Wave 01 review closes Friday, August 7, 2026";

type AccessLane = "wallet-preorder" | "desk-access" | "vault-access";
type Persona = "trader" | "builder" | "fund" | "researcher";

const LANES: { value: AccessLane; label: string; description: string; walletRequired: boolean }[] = [
  {
    value: "wallet-preorder",
    label: "Wallet pre-order",
    description: "Reserve a wallet-based access request before broader onboarding opens.",
    walletRequired: true,
  },
  {
    value: "desk-access",
    label: "Desk access",
    description: "Request access to the human-approved research desk flow.",
    walletRequired: false,
  },
  {
    value: "vault-access",
    label: "Vault access",
    description: "Ask for access to the live on-chain vault surface, caveats first.",
    walletRequired: true,
  },
];

const PERSONAS: { value: Persona; label: string }[] = [
  { value: "trader", label: "Trader" },
  { value: "builder", label: "Builder" },
  { value: "fund", label: "Fund / team" },
  { value: "researcher", label: "Researcher" },
];

function VMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/aelix-mark.png" alt="" aria-hidden="true" className="vx-vmark" />
  );
}

function shortWallet(wallet: string) {
  if (!EVM_ADDRESS_RE.test(wallet)) return "not attached";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function RequestAccessPage() {
  const [lane, setLane] = useState<AccessLane>("wallet-preorder");
  const [wallet, setWallet] = useState("");
  const [email, setEmail] = useState("");
  const [persona, setPersona] = useState<Persona>("trader");
  const [telegram, setTelegram] = useState("");
  const [intent, setIntent] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [copied, setCopied] = useState(false);
  const [requestId, setRequestId] = useState("");

  const selectedLane = LANES.find((item) => item.value === lane) ?? LANES[0];
  const walletClean = wallet.trim();
  const emailClean = email.trim();
  const walletValid = !walletClean || EVM_ADDRESS_RE.test(walletClean);
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailClean);
  const canSubmit = emailValid && walletValid && consent && (!selectedLane.walletRequired || EVM_ADDRESS_RE.test(walletClean));

  const payload = useMemo(() => {
    return [
      `request_id: ${requestId || "draft"}`,
      `lane: ${lane}`,
      `wallet: ${walletClean || "not provided"}`,
      `email: ${emailClean || "not provided"}`,
      `persona: ${persona}`,
      `telegram_or_x: ${telegram.trim() || "not provided"}`,
      `intent: ${intent.trim() || "not provided"}`,
      `access_wave: ${ACCESS_WAVE}`,
      "acknowledged: gated access, unaudited on-chain module, no track record, not investment advice",
    ].join("\n");
  }, [emailClean, intent, lane, persona, requestId, telegram, walletClean]);

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(`AELIX access request ${requestId || ""}`.trim());
    const body = encodeURIComponent(payload);
    return `mailto:${ACCESS_EMAIL}?subject=${subject}&body=${body}`;
  }, [payload, requestId]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    const record = {
      lane,
      wallet: walletClean || null,
      email: emailClean,
      persona,
      telegram: telegram.trim() || null,
      intent: intent.trim() || null,
      accessWave: ACCESS_WAVE,
      consent,
      createdAt: new Date().toISOString(),
    };
    setSubmitting(true);
    setSubmitError("");
    setSubmitted(false);
    setCopied(false);
    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      const data = await res.json();
      if (!res.ok || !data?.id) throw new Error(data?.error || "request failed");
      const id = String(data.id);
      try {
        const current = JSON.parse(localStorage.getItem("aelix_access_requests") || "[]");
        localStorage.setItem("aelix_access_requests", JSON.stringify([{ id, ...record }, ...current].slice(0, 20)));
      } catch {
        // Browser storage is a convenience cache only; the server JSONL write above is the source of truth.
      }
      setRequestId(id);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPayload() {
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="vx-root access-root">
      <div className="vx-veil" aria-hidden="true" />
      <div className="vx-grain" aria-hidden="true" />

      <header className="access-header">
        <Link className="vx-logo" href="/" aria-label="AELIX home">
          <VMark />
          <span>AELIX</span>
        </Link>
        <nav className="access-nav" aria-label="Access navigation">
          <Link className="vx-nav-link" href="/docs">Docs</Link>
          <Link className="vx-nav-link" href={VAULT_URL}>Vault</Link>
        </nav>
      </header>

      <section className="access-shell">
        <div className="access-copy">
          <p className="vx-eyebrow">
            <span className="vx-eyebrow__tick" aria-hidden="true" />
            Request access
          </p>
          <h1 className="access-title">Enter the next access wave.</h1>
          <p className="access-lede">
            AELIX access opens in waves. Drop an EVM wallet to enter Wave 01 for
            the human-approved desk, the wallet pre-order list, and the live on-chain vault.
          </p>
          <div className="access-rail" aria-label="Request rules">
            <div>
              <span>01</span>
              <strong>Wave 01</strong>
              <p>Review closes Friday, August 7, 2026. Earlier wallets get reviewed first.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Wallet first</strong>
              <p>EVM address required for wallet pre-order and vault access lanes.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Human-approved</strong>
              <p>The brokerage desk still stops at a preview until you approve.</p>
            </div>
          </div>
        </div>

        <form className="access-form" onSubmit={submitRequest}>
          <div className="access-card-head">
            <span>Pre-order request</span>
            <span>{submitted ? requestId : "draft"}</span>
          </div>

          <fieldset className="access-lanes">
            <legend>Access lane</legend>
            {LANES.map((item) => (
              <label key={item.value} className={lane === item.value ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="lane"
                  value={item.value}
                  checked={lane === item.value}
                  onChange={() => setLane(item.value)}
                />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="access-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="access-field">
            <span>EVM wallet {selectedLane.walletRequired ? "(required)" : "(optional)"}</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="0x..."
              value={wallet}
              onChange={(event) => setWallet(event.target.value)}
              required={selectedLane.walletRequired}
              aria-invalid={!walletValid || (selectedLane.walletRequired && Boolean(walletClean) && !EVM_ADDRESS_RE.test(walletClean))}
            />
            {!walletValid && <small className="access-error">Use a 42-character EVM address starting with 0x.</small>}
          </label>

          <div className="access-grid">
            <label className="access-field">
              <span>Persona</span>
              <select value={persona} onChange={(event) => setPersona(event.target.value as Persona)}>
                {PERSONAS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="access-field">
              <span>Telegram / X</span>
              <input
                type="text"
                placeholder="@handle"
                value={telegram}
                onChange={(event) => setTelegram(event.target.value)}
              />
            </label>
          </div>

          <label className="access-field">
            <span>What do you want access for?</span>
            <textarea
              rows={4}
              placeholder="Desk access, wallet pre-order, vault access, integration, research..."
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
            />
          </label>

          <label className="access-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I understand AELIX access is gated, the on-chain module is unaudited,
              there is no track record, and this is not investment advice.
            </span>
          </label>

          <button className="vx-btn vx-btn-lime access-submit" type="submit" disabled={!canSubmit || submitting}>
            <span>{submitting ? "Saving request" : submitted ? "Request saved" : "Enter next access wave"}</span>
          </button>

          {submitError && (
            <p className="access-error" role="alert">
              Could not save this request: {submitError}
            </p>
          )}

          <div className="access-summary" aria-live="polite">
            <span>Wallet</span>
            <strong>{shortWallet(walletClean)}</strong>
            <span>Lane</span>
            <strong>{selectedLane.label}</strong>
          </div>

          {submitted && (
            <div className="access-next">
              <p>
                Request is saved in the AELIX access file. Send a copy from your
                inbox too if you want a human-readable trail.
              </p>
              <div className="vx-cta-row">
                <a className="vx-btn vx-btn-lime" href={mailto}>
                  <span>Send request</span>
                </a>
                <button className="vx-btn vx-btn-glass" type="button" onClick={copyPayload}>
                  <span>{copied ? "Copied" : "Copy payload"}</span>
                </button>
              </div>
              <pre>{payload}</pre>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
