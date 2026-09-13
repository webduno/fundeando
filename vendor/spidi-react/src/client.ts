import {
  Bank,
  BcvRate,
  Commerce,
  CryptoOrder,
  CryptoOrderStatus,
  ConfirmPaymentInput,
  ConfirmPaymentResult,
  CreateTransactionInput,
  CreateTransactionResult,
  PosCommerceResponse,
  SaveSessionInput,
  SessionResponse,
  SpidiError,
  TransactionStatus,
} from "./types";
import { resolveMessages, type SpidiMessages } from "./messages";

export const SPIDI_ENVIRONMENTS = {
  production: "https://api.spidipagos.com/api/spidipagos",
  sandbox: "https://sandbox.api.spidipagos.com/api/spidipagos",
} as const;

export type SpidiEnvironment = keyof typeof SPIDI_ENVIRONMENTS;

/** Bancos que el checkout oficial no ofrece. Se cambia con `hiddenBankCodes`. */
export const DEFAULT_HIDDEN_BANK_CODES = ["0104"];

/**
 * Tras un pago exitoso, `GET /spidi_session/{id}` responde con el registro de la
 * transacción en vez de la sesión, y con este mensaje.
 */
export function isPaidSession(response: { message?: string }): boolean {
  return (response.message ?? "").toLowerCase().includes("success transaction");
}

export interface SpidiClientOptions {
  environment?: SpidiEnvironment;
  /** Sobrescribe por completo la URL base (útil para local: http://localhost:1337). */
  baseUrl?: string;
  /** Timeout por request en ms. Por defecto 25000, igual que el checkout oficial. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** `true` loguea cada request/respuesta en la consola del navegador. */
  debug?: boolean;
  /** Logger propio; si se pasa, sustituye al de consola. */
  onDebug?: (event: SpidiDebugEvent) => void;
  /** Textos de los errores del cliente. Se mezclan sobre `DEFAULT_MESSAGES`. */
  messages?: Partial<SpidiMessages>;
  /**
   * Códigos de banco a ocultar del catálogo. Por defecto `["0104"]`, igual que
   * el checkout oficial. `[]` los muestra todos.
   */
  hiddenBankCodes?: string[];
  /** Filtro extra del catálogo, después de `hiddenBankCodes`. */
  filterBanks?: (bank: Bank) => boolean;
  /**
   * Headers extra por request. CORS de SPIDI solo admite `Content-Type`,
   * `Authorization` y `X-Requested-With`: cualquier otro será rechazado.
   */
  headers?: Record<string, string>;
  /** Token para el header `Authorization`. Se resuelve en cada request. */
  getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

export interface SpidiDebugEvent {
  type: "request" | "response" | "error";
  method: string;
  url: string;
  durationMs?: number;
  status?: number;
  body?: unknown;
  data?: unknown;
  error?: unknown;
}

function consoleDebug(event: SpidiDebugEvent) {
  const label = `[spidi] ${event.type} ${event.method} ${event.url}`;
  if (event.type === "error") console.error("[spidi]", label, event);
  else console.debug("[spidi]", label, event);
}

/** Formatea un monto en Bs al formato que exige `set_transactions2`: "10,00". */
export function formatBsAmount(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/**
 * Formatea un monto para mostrarlo, en convención venezolana: punto para los
 * miles y coma decimal (1234.5 → "1.234,50"). No usa `Intl` para dar el mismo
 * resultado en cualquier runtime, sin depender de los datos de locale.
 */
export function formatAmount(amount: number, decimals = 2): string {
  const fixed = Math.abs(amount).toFixed(decimals);
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = amount < 0 ? "-" : "";
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

/** Une tipo y número de documento: ("V", "12345678") → "V12345678". */
export function buildIdentification(type: string, number: string): string {
  return `${type}${number.trim()}`;
}

/**
 * Une prefijo y número: ("0412", "1234567") → "04121234567".
 * El prefijo siempre va con el 0 inicial, aunque llegue como "412".
 */
export function buildInstrument(prefix: string, number: string): string {
  const digits = String(prefix).replace(/\D/g, "");
  const normalizedPrefix = digits.startsWith("0") ? digits : `0${digits}`;
  return `${normalizedPrefix}${number.trim()}`;
}

function apiErrorFor(
  codeId: string | null | undefined,
  message: string | undefined,
  messages: SpidiMessages,
): SpidiError {
  if (codeId === "EPIE02") {
    return new SpidiError(messages.invalidIdentification, "invalid_identification", codeId);
  }
  if (codeId && (codeId.includes("ECB02") || codeId === "ECBE00")) {
    return new SpidiError(messages.bankUnavailable, "bank_unavailable", codeId);
  }
  return new SpidiError(message || messages.apiError, "api", codeId);
}

export class SpidiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;
  private readonly log: ((event: SpidiDebugEvent) => void) | null;
  private messages: SpidiMessages;
  private readonly hiddenBankCodes: Set<string>;
  private readonly filterBanks: (bank: Bank) => boolean;
  private readonly extraHeaders: Record<string, string>;
  private readonly getAuthToken: SpidiClientOptions["getAuthToken"];
  /**
   * GETs en vuelo, por URL. Dos hooks montados a la vez (o StrictMode) comparten
   * la misma petición en lugar de duplicarla. No cachea respuestas: al resolverse
   * la entrada se borra.
   */
  private readonly inFlightGets = new Map<string, Promise<unknown>>();

  constructor(options: SpidiClientOptions = {}) {
    this.log = options.onDebug ?? (options.debug ? consoleDebug : null);
    this.baseUrl = (
      options.baseUrl ?? SPIDI_ENVIRONMENTS[options.environment ?? "production"]
    ).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 25000;
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.messages = resolveMessages(options.messages);
    this.hiddenBankCodes = new Set(options.hiddenBankCodes ?? DEFAULT_HIDDEN_BANK_CODES);
    this.filterBanks = options.filterBanks ?? (() => true);
    this.extraHeaders = options.headers ?? {};
    this.getAuthToken = options.getAuthToken;
  }

  /** Actualiza el catálogo sin cambiar transporte ni deduplicación en vuelo. */
  setMessages(overrides?: Partial<SpidiMessages>): void {
    this.messages = resolveMessages(overrides);
  }

  private request<T>(path: string, init?: RequestInit, logBody?: unknown): Promise<T> {
    const method = init?.method ?? "GET";
    if (method !== "GET") return this.doRequest<T>(path, init, logBody);

    const pending = this.inFlightGets.get(path);
    if (pending) return pending as Promise<T>;

    const request = this.doRequest<T>(path, init, logBody).finally(() => {
      this.inFlightGets.delete(path);
    });
    this.inFlightGets.set(path, request);
    return request;
  }

  private async doRequest<T>(path: string, init?: RequestInit, logBody?: unknown): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new SpidiError(this.messages.offline, "offline");
    }
    const method = init?.method ?? "GET";
    const url = `${this.baseUrl}${path}`;
    const startedAt = Date.now();
    this.log?.({
      type: "request",
      method,
      url,
      body: logBody,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      let headers: Record<string, string> = {
        ...this.extraHeaders,
        ...((init?.headers as Record<string, string>) ?? {}),
      };
      // Solo se espera si hay token que resolver: así el `fetch` sigue saliendo
      // en el mismo tick y la deduplicación de GETs no cambia de comportamiento.
      if (this.getAuthToken) {
        const token = await this.getAuthToken();
        if (token) headers = { ...headers, Authorization: `Bearer ${token}` };
      }
      response = await this.doFetch(`${this.baseUrl}${path}`, {
        ...init,
        ...(Object.keys(headers).length ? { headers } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      this.log?.({
        type: "error",
        method,
        url,
        durationMs: Date.now() - startedAt,
        error,
      });
      if ((error as Error)?.name === "AbortError") {
        throw new SpidiError(this.messages.timeout, "timeout", error);
      }
      throw new SpidiError(this.messages.networkError, "network", error);
    } finally {
      clearTimeout(timer);
    }

    const body = (await response.json().catch(() => null)) as
      | (T & { success?: boolean; message?: string })
      | null;

    this.log?.({
      type: "response",
      method,
      url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      data: body,
    });

    if (!response.ok && !body) {
      throw new SpidiError(
        this.messages.httpError(response.status),
        "http",
        response.status,
      );
    }

    const message = body?.message?.toLowerCase() ?? "";
    if (message.includes("no matching spidi_session found")) {
      throw new SpidiError(this.messages.sessionNotFound, "session_not_found");
    }
    // El backend usa varias redacciones: "The Spidi Session has expired.",
    // "The session is expired", etc.
    if (message.includes("session") && message.includes("expired")) {
      throw new SpidiError(this.messages.sessionExpired, "session_expired");
    }

    return body as T;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    // El objeto original se pasa aparte para el log: evita re-parsear el JSON.
    return this.request<T>(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      body,
    );
  }

  getSession(sessionId: string): Promise<SessionResponse> {
    return this.request<SessionResponse>(`/spidi_session/${sessionId}`);
  }

  /** `alias` es el `pos_commerce_alias` de la sesión. Devuelve `posCommerceId`, comercio y tasa. */
  getPosCommerce(alias: string): Promise<PosCommerceResponse> {
    return this.request<PosCommerceResponse>(`/pos_commerce/${alias}`);
  }

  /** Catálogo de bancos, sin los que el checkout oficial oculta (código 0104). */
  async getBanks(): Promise<Bank[]> {
    const banks = await this.request<Bank[]>("/bank");
    return banks.filter(
      (bank) =>
        !this.hiddenBankCodes.has(String(bank.code).trim()) && this.filterBanks(bank),
    );
  }

  getBcvRate(): Promise<BcvRate> {
    return this.request<BcvRate>("/bcvrate?today=true");
  }

  /** Paso 2: crea la transacción y dispara el envío de la clave de pago (OTP). */
  async createTransaction(
    input: CreateTransactionInput,
  ): Promise<CreateTransactionResult> {
    const json = await this.post<{
      success: boolean;
      data: CreateTransactionResult;
      message?: string;
    }>("/set_transactions2", input);

    if (!json?.success || !json.data || json.data.status === "ERROR" || json.data.codeId) {
      throw apiErrorFor(json?.data?.codeId, json?.message, this.messages);
    }
    return json.data;
  }

  /** Persiste en la sesión los datos del pagador y la transacción creada. */
  async saveSession(input: SaveSessionInput): Promise<{ id: string }> {
    const { save_payment_bank_data: _ignored, ...safeInput } = input as SaveSessionInput & {
      save_payment_bank_data?: unknown;
    };
    const json = await this.post<{
      success: boolean;
      data: { id: string };
      message?: string;
    }>("/spidi_session", {
      spidi_session: { ...safeInput, save_payment_bank_data: false },
    });
    if (!json?.success) throw apiErrorFor(null, json?.message, this.messages);
    return json.data;
  }

  /** Paso 3: confirma el pago con la clave (OTP). Ejecuta el débito. */
  confirmPayment(
    transactionId: number,
    input: ConfirmPaymentInput,
  ): Promise<ConfirmPaymentResult> {
    return this.post<ConfirmPaymentResult>(
      `/set_transactions_sofitasa/${transactionId}`,
      input,
    );
  }

  /**
   * Cripto paso 1: crea la orden Binance Pay. Devuelve deeplink, URL y QR.
   * El monto mínimo lo fija el backend (≈1 USDT); por debajo responde con mensaje.
   */
  async createCryptoOrder(input: {
    sessionId: string;
    amountVes: number;
  }): Promise<CryptoOrder> {
    const json = await this.post<{
      success: boolean;
      message?: string;
      data: CryptoOrder;
    }>("/crypto-binance-session", {
      amount_ves: input.amountVes,
      session_id: input.sessionId,
    });

    if (!json?.success || !json.data) {
      const message = json?.message ?? this.messages.cryptoOrderFailed;
      throw new SpidiError(
        message,
        /monto\s+m[ií]nimo/i.test(message) ? "amount_below_minimum" : "api",
        json,
      );
    }
    return json.data;
  }

  /** Cripto paso 2: estado de la orden en el procesador. */
  async getCryptoOrderStatus(orderId: string): Promise<CryptoOrderStatus> {
    const json = await this.request<{
      success: boolean;
      message?: string;
      data: CryptoOrderStatus;
    }>(`/crypto-order-status/${orderId}`);
    if (!json?.success || !json.data) {
      throw new SpidiError(
        json?.message ?? this.messages.cryptoStatusFailed,
        "api",
        json,
      );
    }
    return json.data;
  }

  /** Cripto paso 3: acredita el pago en SPIDI una vez que el procesador lo reporta. */
  confirmCryptoPayment(
    orderId: string,
    spidiTransaction: ConfirmPaymentInput["spidi_transaction"],
  ): Promise<ConfirmPaymentResult> {
    return this.post<ConfirmPaymentResult>(
      `/spidi_confirm_binance_payment/${orderId}`,
      { spidi_transaction: spidiTransaction },
    );
  }

  /**
   * Confirma a SPIDI que el pagador vio el resultado. El checkout oficial lo
   * envía desde su página de éxito/fallo; sirve para métricas de entrega.
   */
  acknowledgePayment(
    sessionId: string,
    result: "success" | "failed",
    metadata: Record<string, unknown> = { "data-app": "sdk-react" },
  ): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>(`/spidi_payment/${sessionId}/ack`, {
      result,
      metadata,
    });
  }

  /** Datos del comprobante: montos, banco, identificadores y detalle cripto. */
  async getTransaction(transactionId: string): Promise<{
    data: Record<string, unknown>;
    commerce: Commerce;
  }> {
    const json = await this.request<{
      success: boolean;
      data: Record<string, unknown>;
      commerce: Commerce;
    }>(`/spidi_transaction/${transactionId}`);
    if (!json?.success) {
      throw new SpidiError(this.messages.receiptNotFound, "api");
    }
    return { data: json.data, commerce: json.commerce };
  }

  /** Consulta de respaldo cuando se pierde la respuesta del paso 3. */
  async getTransactionStatus(sessionId: string): Promise<TransactionStatus> {
    const json = await this.request<{ success: boolean; data: TransactionStatus }>(
      `/transactions/status/${sessionId}`,
    );
    if (!json?.success) throw apiErrorFor(null, this.messages.statusCheckFailed, this.messages);
    return json.data;
  }
}
