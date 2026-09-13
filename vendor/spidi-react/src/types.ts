export type IdentificationType = "V" | "E" | "P";

export type PhonePrefix = "0412" | "0422" | "0414" | "0424" | "0416" | "0426";

export interface Bank {
  _id: string;
  code: string;
  name: string;
}

export interface BcvRate {
  rate: number;
  euro_rate: number;
  cop_rate: number;
  usdt_rate: number;
  date_rate: string;
  is_stale: boolean;
}

export interface SpidiSession {
  _id: string;
  usd_amount: number;
  bs_amount: number;
  bcv_rate: number;
  main_currency: string;
  spidi_commerce_alias: string;
  pos_commerce_alias: string;
  identifier: string | null;
  identifierLabel: string | null;
  description: string | null;
  expired: boolean;
  success_url: string | null;
  failure_url: string | null;
  allowed_payment_methods: string[];
  transaction_id: number | null;
  spidi_id: number | null;
  [key: string]: unknown;
}

export interface Commerce {
  _id: string;
  name: string;
  short_name: string;
  rif: string;
  logo_url: string | null;
  [key: string]: unknown;
}

export interface SessionResponse {
  success: boolean;
  message?: string;
  data: SpidiSession;
  /** Ausente cuando la sesión ya fue pagada; usa `getPosCommerce` en ese caso. */
  commerce?: Commerce;
}

export interface PosCommerceResponse {
  success: boolean;
  data: { _id: string; main_currency: string; [key: string]: unknown };
  commerce: Commerce;
  bcvrate: BcvRate;
}

export interface CreateTransactionInput {
  /** Tipo + número, ej. "V12345678". */
  identification: string;
  /** Monto en Bs con coma decimal, ej. "10,00". */
  amount: string;
  /** Código del banco, ej. "0102". */
  bankCode: string;
  /** Prefijo + número, ej. "04121234567". */
  instrument: string;
  posCommerceId: string;
}

export interface CreateTransactionResult {
  bankCode: string;
  transactionId: number;
  spidiId: number | null;
  codeId: string | null;
  status: "PENDING" | "ERROR" | string;
}

export interface SaveSessionInput {
  _id: string;
  /** Cripto lo manda como string (`"60014375"`); débito inmediato como número. */
  usd_amount: number;
  bs_amount: number;
  bcv_rate: number;
  spidi_commerce_alias: string;
  pos_commerce_alias: string;
  main_currency: string;
  transaction_id: number | string;
  payer_payment_id: string;
  payer_payment_phone: string;
  bank_id: string;
  spidi_id?: number;
  /** Obligatorio para el backend, aunque sea "". */
  product_service_description: string;
  /** Obligatorio para el backend, aunque sea "". */
  pos_home_url: string;
}

export interface ConfirmPaymentInput {
  /** Clave de pago (OTP) de 8 dígitos. */
  key: string;
  spidi_transaction: Omit<SaveSessionInput, "_id"> & { spidi_session_id: string };
}

/** Detalle que devuelve el banco cuando rechaza el débito. */
export interface BankRejection {
  status: string;
  codeId: string;
  developerDescription?: string;
  userDescription?: string;
  bankTransactionId?: string;
  [key: string]: unknown;
}

export interface ConfirmPaymentResult {
  success: boolean;
  data?: {
    id?: string;
    spidi_session_error_id?: string;
    /** Objeto con el detalle del banco cuando `success` es `false`. */
    message?: BankRejection | string;
    [key: string]: unknown;
  };
  message?: string;
}

export interface TransactionStatus {
  status: "paid" | "success" | "failed" | "pending" | string;
  spidi_session_error_id?: string;
  spidi_transaction?: { _id: string; [key: string]: unknown };
}

/** Orden de pago cripto (Binance Pay) creada por `crypto-binance-session`. */
export interface CryptoOrder {
  crixto_order_id: string;
  status: string;
  /** URL web de Binance Pay (desktop). */
  payment_url: string;
  /** Deeplink `bnc://` para abrir la app. */
  payment_deeplink: string;
  payment_qr: {
    /** PNG en data URI, listo para un `<img src>`. */
    img: string;
    url: string;
  };
  transaction_spidi_id: number;
  accredit_spidi_id: number;
  session_spidi_id: string;
  user_spidi_id: string;
  webhook_url: string;
  amount_transaction_ves: number;
}

export interface CryptoOrderStatus {
  crixto_order_id: string;
  /** `PENDING` | `PAID_PENDING` | `PAID` | `EXPIRED` … */
  status: string;
  order_details?: {
    transaction_spidi_id: number;
    processor_name: string;
    currency_crypto: string;
    paid_at: string | null;
    amount_transaction_ves: number;
    [key: string]: unknown;
  };
}

export type SpidiCryptoStatus =
  | "loading"
  | "ready"
  | "creating"
  | "awaiting_payment"
  | "verifying"
  | "success"
  | "failed";

export type SpidiCheckoutStatus =
  | "loading"
  | "ready"
  | "creating"
  | "awaiting_otp"
  | "confirming"
  | "success"
  | "failed";

export interface SpidiTransaction {
  transactionId: number;
  spidiId: number | null;
}

/** Montos de la sesión: crudos para calcular, formateados para pintar. */
export interface SpidiAmounts {
  usd: number;
  bs: number;
  bcvRate: number;
  /** "0,01" */
  usdFormatted: string;
  /** "1.234,50" */
  bsFormatted: string;
  /** "742,23" */
  bcvRateFormatted: string;
}

export interface SpidiCheckoutResult {
  /** Id de la sesión/transacción para el comprobante. */
  id?: string;
  errorId?: string;
  /** Detalle del banco cuando el débito fue rechazado (ej. `BE01`). */
  rejection?: BankRejection;
}

export class SpidiError extends Error {
  constructor(
    message: string,
    readonly code:
      | "network"
      | "timeout"
      | "offline"
      | "http"
      | "api"
      | "invalid_identification"
      | "bank_unavailable"
      | "payment_rejected"
      | "validation"
      | "amount_below_minimum"
      | "payment_not_received"
      | "session_expired"
      | "session_not_found",
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "SpidiError";
  }

  /** @deprecated Usa `detail`; este alias se eliminará en la próxima major. */
  get details(): unknown {
    return this.detail;
  }
}
