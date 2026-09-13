import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpidiClient, SpidiClientOptions, formatAmount, isPaidSession } from "./client";
import { type SpidiMessages } from "./messages";
import { useStableMessages } from "./useStableMessages";
import { useSpidiClient } from "./useSpidiClient";
import { SpidiEvent, SpidiEventEmitter } from "./events";
import {
  isMethodAvailable,
  resolvePaymentMethods,
  type ResolvedPaymentMethod,
  type SpidiPaymentMethod,
} from "./methods";
import {
  Commerce,
  CryptoOrder,
  SpidiAmounts,
  SpidiCheckoutResult,
  SpidiCryptoStatus,
  SpidiError,
  SpidiSession,
} from "./types";

/** Banco fijo que SPIDI usa para acreditar pagos cripto. Se cambia con `cryptoBankId`. */
export const CRYPTO_BANK_ID = "a6c45c77-f9b7-4ef5-b9b3-b765dbf5118d";

/** Estados del procesador que cuentan como pagado. */
const DEFAULT_PAID_STATUSES = ["PAID", "PAID_PENDING"];

export interface UseSpidiCryptoOptions extends SpidiClientOptions {
  sessionId: string;
  client?: SpidiClient;
  /** Si se define, consulta el estado de la orden cada N ms mientras se espera el pago. */
  pollIntervalMs?: number;
  /** Métodos que tu integración habilita. Se cruzan con los que permite la sesión. */
  enabledMethods?: SpidiPaymentMethod[];
  posHomeUrl?: string;
  productServiceDescription?: string;
  onEvent?: (event: SpidiEvent) => void;
  emitter?: SpidiEventEmitter;
  onSuccess?: (result: SpidiCheckoutResult) => void;
  onFailure?: (result: SpidiCheckoutResult) => void;
  /** Textos del SDK. Se mezclan sobre `DEFAULT_MESSAGES`. */
  messages?: Partial<SpidiMessages>;
  /** Formateo de los montos de `amounts`. Por defecto, convención venezolana. */
  formatAmount?: (amount: number) => string;
  /** Banco con el que SPIDI acredita el pago cripto. Por defecto `CRYPTO_BANK_ID`. */
  cryptoBankId?: string;
  /** Estados del procesador que cuentan como pagado. Por defecto `["PAID", "PAID_PENDING"]`. */
  paidStatuses?: string[];
  /** `false` no carga la sesión al montar; se dispara con `load()`. */
  autoLoad?: boolean;
  /** `false` no reporta la entrega del pago a SPIDI. Por defecto `true`. */
  autoAcknowledge?: boolean;
}

export interface UseSpidiCryptoReturn {
  emitter: SpidiEventEmitter;
  sessionId: string;
  status: SpidiCryptoStatus;
  error: SpidiError | null;
  session: SpidiSession | null;
  commerce: Commerce | null;
  /** Montos de la sesión, crudos y formateados. */
  amounts: SpidiAmounts | null;
  /** Orden Binance Pay: deeplink, URL y QR listo para pintar. */
  order: CryptoOrder | null;
  /** Último estado devuelto por el procesador (`PENDING`, `PAID`…). */
  orderStatus: string | null;
  result: SpidiCheckoutResult | null;
  isBusy: boolean;
  /** Métodos de pago con su disponibilidad, para pintar/deshabilitar pestañas. */
  methods: ResolvedPaymentMethod[];
  /** `true` si la sesión permite cripto y tu integración lo tiene habilitado. */
  cryptoAllowed: boolean;
  /** Carga la sesión a mano cuando `autoLoad` es `false`. */
  load: () => Promise<void>;
  createOrder: () => Promise<void>;
  /** "Ya pagué": consulta el procesador y, si pagó, acredita en SPIDI. */
  checkPayment: () => Promise<boolean>;
  reset: () => void;
}

function toSpidiError(error: unknown, messages: SpidiMessages): SpidiError {
  return error instanceof SpidiError
    ? error
    : new SpidiError(messages.cryptoUnexpectedError, "api", error);
}

export function useSpidiCrypto(options: UseSpidiCryptoOptions): UseSpidiCryptoReturn {
  const {
    sessionId,
    client: providedClient,
    pollIntervalMs,
    enabledMethods,
    posHomeUrl = "",
    productServiceDescription: productServiceDescriptionOption,
    onEvent,
    emitter: providedEmitter,
    onSuccess,
    onFailure,
    messages: messagesOption,
    formatAmount: formatAmountOption = formatAmount,
    cryptoBankId = CRYPTO_BANK_ID,
    paidStatuses = DEFAULT_PAID_STATUSES,
    autoLoad = true,
    autoAcknowledge = true,
    ...clientOptions
  } = options;

  const messages = useStableMessages(messagesOption);
  const client = useSpidiClient(providedClient, clientOptions, messages);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [status, setStatus] = useState<SpidiCryptoStatus>("loading");
  const [error, setError] = useState<SpidiError | null>(null);
  const [session, setSession] = useState<SpidiSession | null>(null);
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [order, setOrder] = useState<CryptoOrder | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [result, setResult] = useState<SpidiCheckoutResult | null>(null);

  const inFlight = useRef(false);
  const fallbackEmitter = useRef<SpidiEventEmitter | null>(null);
  if (!fallbackEmitter.current) fallbackEmitter.current = new SpidiEventEmitter();
  const emitter = providedEmitter ?? fallbackEmitter.current;

  // Refs de callbacks actualizadas en efecto, no durante el render.
  const onEventRef = useRef(onEvent);
  const emitterRef = useRef(emitter);
  useEffect(() => {
    onEventRef.current = onEvent;
    emitterRef.current = emitter;
  });

  const emit = useCallback((event: SpidiEvent) => {
    onEventRef.current?.(event);
    emitterRef.current.emit(event);
  }, []);

  const previousStatus = useRef<SpidiCryptoStatus>("loading");
  useEffect(() => {
    if (previousStatus.current === status) return;
    const previous = previousStatus.current;
    previousStatus.current = status;
    // Los eventos comparten forma con los del checkout en Bs.
    emit({
      type: "status_change",
      status,
      previous,
    });
  }, [status, emit]);

  const loadSession = useCallback(
    async (isActive: () => boolean) => {
      setStatus("loading");
      setError(null);
      try {
        const sessionRes = await client.getSession(sessionId);
        if (!isActive()) return;
        setSession(sessionRes.data);
        setCommerce(sessionRes.commerce ?? null);
        emit({
          type: "session_loaded",
          session: sessionRes.data,
          commerce: sessionRes.commerce ?? null,
        });

        if (sessionRes.data.expired === true) {
          throw new SpidiError(
            messagesRef.current.sessionExpired,
            "session_expired",
          );
        }
        if (isPaidSession(sessionRes)) {
          const paid = { id: sessionRes.data._id };
          setResult(paid);
          setStatus("success");
          emit({ type: "session_paid", result: paid });
          onSuccess?.(paid);
          return;
        }
        setStatus("ready");
      } catch (e) {
        if (!isActive()) return;
        const failure = toSpidiError(e, messagesRef.current);
        setError(failure);
        setStatus("failed");
        emit({ type: "error", error: failure });
      }
    },
    [client, sessionId, emit],
  );

  useEffect(() => {
    if (!autoLoad) return;
    let active = true;
    void loadSession(() => active);
    return () => {
      active = false;
    };
  }, [autoLoad, loadSession]);

  /** Carga manual, para `autoLoad: false`. */
  const load = useCallback(() => loadSession(() => true), [loadSession]);

  const productServiceDescription =
    productServiceDescriptionOption ??
    (typeof session?.product_service_description === "string"
      ? session.product_service_description
      : "");

  const createOrder = useCallback(async () => {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setStatus("creating");
    try {
      const created = await client.createCryptoOrder({
        sessionId: session._id,
        amountVes: session.bs_amount,
      });
      setOrder(created);
      setOrderStatus(created.status);
      setStatus("awaiting_payment");
      emit({
        type: "transaction_created",
        transaction: {
          transactionId: created.transaction_spidi_id,
          spidiId: created.transaction_spidi_id,
        },
        resent: false,
      });
    } catch (e) {
      const failure = toSpidiError(e, messages);
      setError(failure);
      setStatus("ready");
      emit({ type: "error", error: failure });
    } finally {
      inFlight.current = false;
    }
  }, [client, session, messages, emit]);

  const checkPayment = useCallback(async () => {
    if (!session || !order || inFlight.current) return false;
    inFlight.current = true;
    setError(null);
    setStatus("verifying");
    try {
      const remote = await client.getCryptoOrderStatus(order.crixto_order_id);
      setOrderStatus(remote.status);

      if (!paidStatuses.includes(remote.status)) {
        setError(
          new SpidiError(
            messages.cryptoPaymentNotReceived,
            "payment_not_received",
            remote.status,
          ),
        );
        setStatus("awaiting_payment");
        return false;
      }

      const response = await client.confirmCryptoPayment(
        order.crixto_order_id,
        {
          // El checkout oficial lo manda como string.
          transaction_id: `600${parseInt(order.crixto_order_id, 10)}`,
          usd_amount: session.usd_amount,
          bs_amount: session.bs_amount,
          bcv_rate: session.bcv_rate,
          payer_payment_id: "NA",
          payer_payment_phone: "NA",
          bank_id: cryptoBankId,
          spidi_session_id: session._id,
          spidi_commerce_alias: session.spidi_commerce_alias,
          pos_commerce_alias: session.pos_commerce_alias,
          main_currency: session.main_currency,
          spidi_id: order.transaction_spidi_id,
          pos_home_url: posHomeUrl,
          product_service_description: productServiceDescription,
        },
      );

      const payload: SpidiCheckoutResult = {
        id: response.data?.id,
        errorId: response.data?.spidi_session_error_id,
      };
      setResult(payload);
      if (response.success) {
        setStatus("success");
        // Métrica de entrega; no debe bloquear ni romper el flujo.
        if (autoAcknowledge) {
          void client.acknowledgePayment(session._id, "success").catch(() => {});
        }
        emit({ type: "payment_succeeded", result: payload });
        onSuccess?.(payload);
        return true;
      }
      const failure = new SpidiError(
        messages.cryptoNotCredited,
        "payment_rejected",
        response,
      );
      setError(failure);
      setStatus("failed");
      emit({ type: "payment_failed", result: payload, error: failure });
      onFailure?.(payload);
      return false;
    } catch (e) {
      const failure = toSpidiError(e, messages);
      setError(failure);
      setStatus("awaiting_payment");
      emit({ type: "error", error: failure });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [
    client,
    session,
    order,
    posHomeUrl,
    productServiceDescription,
    onSuccess,
    onFailure,
    messages,
    cryptoBankId,
    paidStatuses,
    autoAcknowledge,
    emit,
  ]);

  const checkPaymentRef = useRef(checkPayment);
  checkPaymentRef.current = checkPayment;

  useEffect(() => {
    if (!pollIntervalMs || status !== "awaiting_payment") return;
    const timer = setInterval(() => {
      void checkPaymentRef.current();
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, status]);

  const amounts = useMemo(
    () =>
      session
        ? {
            usd: session.usd_amount,
            bs: session.bs_amount,
            bcvRate: session.bcv_rate,
            usdFormatted: formatAmountOption(session.usd_amount),
            bsFormatted: formatAmountOption(session.bs_amount),
            bcvRateFormatted: formatAmountOption(session.bcv_rate),
          }
        : null,
    [session, formatAmountOption],
  );

  const reset = useCallback(() => {
    if (status === "success") return;
    setOrder(null);
    setOrderStatus(null);
    setResult(null);
    setError(null);
    setStatus(session ? "ready" : "loading");
  }, [session, status]);

  return {
    emitter,
    sessionId,
    status,
    error,
    session,
    commerce,
    amounts,
    order,
    orderStatus,
    result,
    isBusy: status === "loading" || status === "creating" || status === "verifying",
    methods: resolvePaymentMethods(session, enabledMethods),
    cryptoAllowed: isMethodAvailable(session, "crypto", enabledMethods),
    load,
    createOrder,
    checkPayment,
    reset,
  };
}
