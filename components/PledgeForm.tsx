"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authedFetch, readJson } from "@/lib/api";
import { MIN_PLEDGE_USDT, formatUsdt, parseUsdt } from "@/lib/spidi/shared";
import type { Pledge } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { CryptoPay } from "./CryptoPay";

type PledgeFormProps = {
  campaignId: string;
  recipientAlias: string | null;
  acceptingPledges: boolean;
};

type CreatedPledge = Pick<
  Pledge,
  "id" | "spidi_session_id" | "amount_usdt" | "amount_bs" | "bcv_rate" | "status"
>;

type Step = "form" | "pay" | "confirming" | "done" | "unconfirmed";

export function PledgeForm({ campaignId, recipientAlias, acceptingPledges }: PledgeFormProps) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pledge, setPledge] = useState<CreatedPledge | null>(null);
  const [step, setStep] = useState<Step>("form");

  if (!ready) return null;

  if (!acceptingPledges) {
    return <p className="muted">This campaign is no longer accepting pledges.</p>;
  }

  if (!recipientAlias) {
    return <p className="muted">The creator has not set a SPIDI alias yet.</p>;
  }

  if (!user) {
    return (
      <p className="muted">
        <Link href="/login">Sign in</Link> to back this campaign.
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const usdt = parseUsdt(amount);
    if (!usdt || usdt < MIN_PLEDGE_USDT) {
      setError(`Minimum pledge is ${MIN_PLEDGE_USDT} USDT.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await authedFetch("/api/pledges", {
        method: "POST",
        body: JSON.stringify({ campaignId, amountUsdt: usdt }),
      });
      const json = await readJson<{ pledge: CreatedPledge }>(response);
      setPledge(json.pledge);
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the pledge.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pledge) return;
    setStep("confirming");
    try {
      const response = await authedFetch(`/api/pledges/${pledge.id}/confirm`, { method: "POST" });
      const json = await readJson<{ status: Pledge["status"] }>(response);
      if (json.status === "paid") {
        setStep("done");
        router.refresh();
        return;
      }
      setStep("unconfirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the pledge.");
      setStep("unconfirmed");
    }
  }

  if (step === "pay" && pledge) {
    return (
      <div className="stack">
        <CryptoPay
          sessionId={pledge.spidi_session_id}
          recipientAlias={recipientAlias}
          onPaid={() => void confirm()}
        />
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setPledge(null);
            setStep("form");
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (step === "confirming") {
    return <p className="muted">Confirming with the server…</p>;
  }

  if (step === "done" && pledge) {
    return (
      <p className="success">
        Thank you. Your pledge of USDT {formatUsdt(pledge.amount_usdt)} is recorded.
      </p>
    );
  }

  if (step === "unconfirmed") {
    return (
      <div className="stack">
        <p className="muted">
          SPIDI reported the payment but the server could not verify it yet. You can retry from{" "}
          <Link href="/account">your account</Link>.
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <label className="field">
        <span>Amount (USDT)</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="e.g. 5"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Creating payment…" : "Back this campaign"}
      </button>
      <p className="muted small">
        Paid in USDT via Binance Pay directly to @{recipientAlias}. Minimum {MIN_PLEDGE_USDT} USDT.
      </p>
    </form>
  );
}
