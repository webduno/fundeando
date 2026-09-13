/** Browser calls go through the Next rewrite in next.config.ts. */
export const SPIDI_BROWSER_BASE = "/spidi-api";

export const SPIDI_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

/** Binance Pay minimum enforced by SPIDI's backend (≈1 USDT). */
export const MIN_PLEDGE_USDT = 1;

export function normalizeAlias(raw: string) {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function parseUsdt(raw: string) {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function formatUsdt(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBs(value: number) {
  return value.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Username cobros (mispidi `?id=`) often omit `allowed_payment_methods`.
 * mispidi treats that as crypto allowed; the SDK treats it as empty → blocked.
 */
export function sessionAllowsCrypto(methods: string[] | null | undefined): boolean {
  if (!Array.isArray(methods) || methods.length === 0) return true;
  return methods.includes("crypto");
}
