import {
  SpidiClient,
  isPaidSession,
  type BcvRate,
  type Commerce,
} from "@tiquemax/spidi-react/core";
import { SPIDI_HEADERS } from "./shared";

// Server talks to SPIDI directly, not through the /spidi-api rewrite.
export function spidiApiUrl() {
  return (
    process.env.SPIDI_API_URL ?? "https://sandbox.api.spidipagos.com/api/spidipagos"
  );
}

function serverClient() {
  return new SpidiClient({ baseUrl: spidiApiUrl(), headers: SPIDI_HEADERS });
}

type PosIdentifier = { _id: string; name: string; use_default_values?: boolean };

type PosCommerceLookup = {
  success: boolean;
  message?: string;
  data: {
    _id: string;
    alias: string;
    main_currency?: string;
    pos_commerce_identifier?: PosIdentifier[];
  };
  commerce: Commerce;
  bcvrate: BcvRate;
};

export async function lookupCommerce(alias: string): Promise<PosCommerceLookup> {
  return serverClient().getPosCommerce(alias) as Promise<PosCommerceLookup>;
}

export function usdtRateFrom(rate: BcvRate | null | undefined) {
  if (!rate) return 0;
  return rate.usdt_rate || rate.rate || 0;
}

export type CreatedSpidiSession = {
  sessionId: string;
  usdtAmount: number;
  bsAmount: number;
  bcvRate: number;
  recipientAlias: string;
};

/**
 * Creates a SPIDI session for `usdtAmount` payable to `recipientAlias`.
 * Mirrors the mispidi `?id=` flow. Amounts are computed here, never trusted from the client.
 */
export async function createSpidiSession(input: {
  recipientAlias: string;
  usdtAmount: number;
  payerLabel: string;
  concept: string;
}): Promise<CreatedSpidiSession> {
  const lookup = await lookupCommerce(input.recipientAlias);
  if (!lookup.success || !lookup.commerce) {
    throw new Error(lookup.message || "SPIDI alias not found.");
  }

  const bcvRate = usdtRateFrom(lookup.bcvrate);
  if (!bcvRate) throw new Error("No USDT rate available from SPIDI.");

  const bsAmount = Math.round(input.usdtAmount * bcvRate * 100) / 100;
  const identifier = lookup.data.pos_commerce_identifier?.[0];

  const body = {
    spidi_session: {
      usd_amount: input.usdtAmount,
      bs_amount: bsAmount,
      bcv_rate: bcvRate,
      spidi_commerce_alias: input.recipientAlias,
      pos_commerce_alias: lookup.data.alias || input.recipientAlias,
      pos_home_url: "kickstart",
      main_currency: "usdt",
      product_service_description: input.concept,
    },
    spidi_session_identifier_values: identifier
      ? [{ pos_commerce_identifier_id: identifier._id, value: input.payerLabel }]
      : [],
  };

  const response = await fetch(`${spidiApiUrl()}/spidi_session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SPIDI_HEADERS },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as {
    success?: boolean;
    data?: { id?: string };
    message?: string;
  };

  if (!json.success || !json.data?.id) {
    throw new Error(json.message || "Could not create the SPIDI session.");
  }

  return {
    sessionId: json.data.id,
    usdtAmount: input.usdtAmount,
    bsAmount,
    bcvRate,
    recipientAlias: input.recipientAlias,
  };
}

export type SpidiVerification = "paid" | "pending" | "expired";

/**
 * Asks SPIDI whether a session has been credited. Two sources, because after a
 * successful payment `GET /spidi_session/{id}` returns the transaction record
 * instead of the session.
 */
export async function verifySpidiSession(sessionId: string): Promise<SpidiVerification> {
  const client = serverClient();

  try {
    const session = await client.getSession(sessionId);
    if (isPaidSession(session)) return "paid";
    if (session.data?.expired === true) return "expired";
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "session_expired") return "expired";
    // Fall through to the status endpoint on any other failure.
  }

  try {
    const status = await client.getTransactionStatus(sessionId);
    const value = String(status.status ?? "").toLowerCase();
    if (value === "paid" || value === "success") return "paid";
  } catch {
    // No transaction yet is the normal case while pending.
  }

  return "pending";
}
