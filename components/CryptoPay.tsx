"use client";

import { useSpidiCrypto } from "@tiquemax/spidi-react";
import { useEffect, useRef } from "react";
import {
  SPIDI_BROWSER_BASE,
  SPIDI_HEADERS,
  formatBs,
  formatUsdt,
  sessionAllowsCrypto,
} from "@/lib/spidi/shared";

type CryptoPayProps = {
  sessionId: string;
  recipientAlias: string;
  /** Fired when the SDK reports the payment credited. Caller must still confirm server-side. */
  onPaid: () => void;
};

/** Binance Pay step: creates the order, shows QR/deeplink, polls until credited. */
export function CryptoPay({ sessionId, recipientAlias, onPaid }: CryptoPayProps) {
  const crypto = useSpidiCrypto({
    sessionId,
    baseUrl: SPIDI_BROWSER_BASE,
    headers: SPIDI_HEADERS,
    pollIntervalMs: 5000,
    autoAcknowledge: true,
    onSuccess: onPaid,
  });

  const cryptoOk = sessionAllowsCrypto(crypto.session?.allowed_payment_methods);
  const { status, createOrder, error } = crypto;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (status !== "ready" || !cryptoOk) return;
    started.current = true;
    void createOrder();
  }, [status, cryptoOk, createOrder]);

  if (status === "loading" || status === "creating") {
    return <p className="muted">Creating the Binance Pay order…</p>;
  }

  if (status === "failed") {
    return <p className="error">{error?.message || "Could not load the payment session."}</p>;
  }

  if (status === "ready" && !cryptoOk) {
    return <p className="error">This session does not accept crypto payments.</p>;
  }

  if (status === "success") {
    return <p className="success">Payment credited to @{recipientAlias}.</p>;
  }

  const payHref = crypto.order?.payment_deeplink || crypto.order?.payment_url;

  return (
    <div className="stack">
      <p className="muted">
        Pay to <strong>@{recipientAlias}</strong>
        {crypto.amounts && (
          <>
            {" · "}USDT {formatUsdt(crypto.amounts.usd)} · Bs. {formatBs(crypto.amounts.bs)}
          </>
        )}
      </p>

      {crypto.order?.payment_qr.img && (
        // Data URI from the SDK; next/image is not useful here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crypto.order.payment_qr.img} alt="Binance Pay QR" className="qr" />
      )}

      {payHref && (
        <a href={payHref} target="_blank" rel="noopener noreferrer" className="button">
          Open Binance
        </a>
      )}

      <p className="muted small">
        {status === "verifying" ? "Verifying payment…" : "Checking status every 5 seconds"}
        {crypto.orderStatus ? ` · ${crypto.orderStatus}` : ""}
      </p>

      {crypto.error && crypto.error.code !== "payment_not_received" && (
        <p className="error">{crypto.error.message}</p>
      )}
    </div>
  );
}
