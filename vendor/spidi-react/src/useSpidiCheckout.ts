import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SpidiClient,
  SpidiClientOptions,
  buildIdentification,
  buildInstrument,
  formatAmount,
  formatBsAmount,
  isPaidSession,
} from "./client";
import {
  PHONE_PREFIXES,
  hasErrors,
  sanitizeIdentification,
  sanitizePaymentKey,
  sanitizePhoneNumber,
  validatePayer,
  validatePaymentKey,
  type PayerValidationErrors,
} from "./validation";
import { type SpidiMessages } from "./messages";
import { useStableMessages } from "./useStableMessages";
import { useSpidiClient } from "./useSpidiClient";
import { noStoreFieldProps, noStoreFormProps, noStoreOtpFieldProps } from "./fields";
import {
  Bank,
  BankRejection,
  Commerce,
  ConfirmPaymentResult,
  IdentificationType,
  PhonePrefix,
  SpidiAmounts,
  SpidiCheckoutResult,
  SpidiCheckoutStatus,
  SpidiError,
  SpidiSession,
  SpidiTransaction,
} from "./types";
import { SpidiEvent, SpidiEventEmitter } from "./events";
import {
  resolvePaymentMethods,
  type ResolvedPaymentMethod,
  type SpidiPaymentMethod,
} from "./methods";

export type {
  SpidiCheckoutResult,
  SpidiCheckoutStatus,
  SpidiTransaction,
} from "./types";

export interface PayerInput {
  identificationType: IdentificationType;
  identificationNumber: string;
  phonePrefix: PhonePrefix;
  phoneNumber: string;
  /** Banco seleccionado del catálogo (`banks`). */
  bank: Bank;
}

function readBankRejection(response: ConfirmPaymentResult): BankRejection | undefined {
  const detail = response.data?.message;
  return detail && typeof detail === "object" ? detail : undefined;
}

export interface UseSpidiCheckoutOptions extends SpidiClientOptions {
  sessionId: string;
  /** Instancia propia del cliente; si se pasa, ignora environment/baseUrl. */
  client?: SpidiClient;
  /** Segundos antes de habilitar el reenvío de clave. Por defecto 20 (igual al checkout oficial). */
  resendDelaySeconds?: number;
  /** Métodos que tu integración habilita. Se cruzan con los que permite la sesión. */
  enabledMethods?: SpidiPaymentMethod[];
  /** Se envía al backend en cada paso; obligatorio aunque vaya vacío. Por defecto "". */
  posHomeUrl?: string;
  /** Concepto del pago. Por defecto el de la sesión, o "". */
  productServiceDescription?: string;
  onSuccess?: (result: SpidiCheckoutResult) => void;
  onFailure?: (result: SpidiCheckoutResult) => void;
  /** Recibe todos los eventos del checkout. */
  onEvent?: (event: SpidiEvent) => void;
  /**
   * Emisor propio para suscribirse por tipo (`emitter.on("payment_succeeded", cb)`).
   * Si no se pasa, el hook crea uno y lo expone en `emitter`.
   */
  emitter?: SpidiEventEmitter;
  /** Textos del SDK. Se mezclan sobre `DEFAULT_MESSAGES`. */
  messages?: Partial<SpidiMessages>;
  /** Formateo de los montos de `amounts`. Por defecto, convención venezolana. */
  formatAmount?: (amount: number) => string;
  /** Prefijos telefónicos admitidos. Por defecto los seis de `PHONE_PREFIXES`. */
  phonePrefixes?: readonly string[];
  /** Reglas propias; reemplaza por completo la validación de fábrica. */
  validate?: (input: PayerInput) => PayerValidationErrors;
  /** Cuándo validar los campos que maneja el hook. Por defecto `"submit"`. */
  validateOn?: "submit" | "blur" | "change";
  /** `false` no carga la sesión al montar; se dispara con `load()`. */
  autoLoad?: boolean;
  /** `false` no reporta la entrega del pago a SPIDI. Por defecto `true`. */
  autoAcknowledge?: boolean;
}

/** Campos del formulario cuando los maneja el hook. */
export interface PayerFields {
  identificationType: IdentificationType;
  identificationNumber: string;
  phonePrefix: PhonePrefix;
  phoneNumber: string;
  /** `_id` del banco elegido del catálogo `banks`. */
  bankId: string;
  /** Clave de pago (OTP). */
  key: string;
}

const EMPTY_FIELDS: PayerFields = {
  identificationType: "V",
  identificationNumber: "",
  phonePrefix: "0412",
  phoneNumber: "",
  bankId: "",
  key: "",
};

/** Qué error de validación corresponde a cada campo del formulario. */
const VALIDATION_FIELD: Partial<Record<keyof PayerFields, keyof PayerValidationErrors>> = {
  identificationNumber: "identificationNumber",
  identificationType: "identificationNumber",
  phonePrefix: "phonePrefix",
  phoneNumber: "phoneNumber",
  bankId: "bank",
};

/** Props que devuelven los getters; se pueden extender al llamarlos. */
type FieldProps = Record<string, unknown>;

export interface UseSpidiCheckoutReturn {
  /** Emisor de eventos del checkout: `emitter.on("payment_succeeded", cb)`. */
  emitter: SpidiEventEmitter;
  /** Id de la sesión de pago con la que se inicializó el checkout. */
  sessionId: string;
  /** Métodos de pago con su disponibilidad, para pintar/deshabilitar pestañas. */
  methods: ResolvedPaymentMethod[];
  status: SpidiCheckoutStatus;
  error: SpidiError | null;
  session: SpidiSession | null;
  commerce: Commerce | null;
  banks: Bank[];
  transaction: SpidiTransaction | null;
  result: SpidiCheckoutResult | null;
  amounts: SpidiAmounts | null;
  /** Errores por campo del formulario de datos, tras `submitPayer`. */
  validationErrors: PayerValidationErrors;
  /** Error de formato de la clave de pago, tras `confirmPayment`. */
  keyValidationError: string | null;
  /** Segundos restantes para poder reenviar la clave. */
  resendIn: number;
  canResend: boolean;
  isBusy: boolean;
  /** Estado de los campos que maneja el hook (si usas los prop getters). */
  fields: PayerFields;
  /** Escribe un campo aplicando el saneado que corresponda. */
  setField: <K extends keyof PayerFields>(name: K, value: PayerFields[K]) => void;
  /** Prefijos telefónicos admitidos, para pintar el `<select>`. */
  phonePrefixes: readonly string[];
  /** `onSubmit` del paso actual: datos del pagador o confirmación de la clave. */
  getFormProps: (props?: FieldProps) => FieldProps;
  getIdentificationTypeProps: (props?: FieldProps) => FieldProps;
  getIdentificationProps: (props?: FieldProps) => FieldProps;
  getPhonePrefixProps: (props?: FieldProps) => FieldProps;
  getPhoneProps: (props?: FieldProps) => FieldProps;
  getBankProps: (props?: FieldProps) => FieldProps;
  getKeyProps: (props?: FieldProps) => FieldProps;
  /** Carga la sesión a mano cuando `autoLoad` es `false`. */
  load: () => Promise<void>;
  /** Sin argumento usa los campos del hook. */
  submitPayer: (input?: PayerInput) => Promise<void>;
  resendKey: () => Promise<void>;
  /** Sin argumento usa `fields.key`. */
  confirmPayment: (key?: string) => Promise<void>;
  /** Consulta de respaldo si se perdió la respuesta de la confirmación. */
  checkStatus: () => Promise<SpidiCheckoutResult>;
  reset: () => void;
}

function toSpidiError(error: unknown, messages: SpidiMessages): SpidiError {
  return error instanceof SpidiError
    ? error
    : new SpidiError(messages.unexpectedError, "api", error);
}

/**
 * Une los props del getter con los que pase el integrador: los handlers del SDK
 * corren primero y después el del integrador, para no perder ninguno.
 */
function mergeProps(own: FieldProps, extra?: FieldProps): FieldProps {
  if (!extra) return own;
  const merged: FieldProps = { ...own, ...extra };
  for (const key of Object.keys(extra)) {
    const ours = own[key];
    const theirs = extra[key];
    if (typeof ours === "function" && typeof theirs === "function") {
      merged[key] = (...args: unknown[]) => {
        (ours as (...a: unknown[]) => void)(...args);
        (theirs as (...a: unknown[]) => void)(...args);
      };
    }
  }
  return merged;
}

export function useSpidiCheckout(
  options: UseSpidiCheckoutOptions,
): UseSpidiCheckoutReturn {
  const {
    sessionId,
    client: providedClient,
    resendDelaySeconds = 20,
    enabledMethods,
    posHomeUrl = "",
    productServiceDescription: productServiceDescriptionOption,
    onEvent,
    emitter: providedEmitter,
    onSuccess,
    onFailure,
    messages: messagesOption,
    formatAmount: formatAmountOption = formatAmount,
    phonePrefixes = PHONE_PREFIXES,
    validate,
    validateOn = "submit",
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

  const [status, setStatus] = useState<SpidiCheckoutStatus>("loading");
  const [error, setError] = useState<SpidiError | null>(null);
  const [session, setSession] = useState<SpidiSession | null>(null);
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [transaction, setTransaction] = useState<SpidiTransaction | null>(null);
  const [result, setResult] = useState<SpidiCheckoutResult | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [validationErrors, setValidationErrors] = useState<PayerValidationErrors>({});
  const [keyValidationError, setKeyValidationError] = useState<string | null>(null);
  const [fields, setFields] = useState<PayerFields>(EMPTY_FIELDS);

  const posCommerceId = useRef<string | null>(null);
  const lastPayer = useRef<PayerInput | null>(null);
  const isPaidRef = useRef(false);
  /** Evita dobles envíos: un segundo click no debe crear otra transacción ni doble débito. */
  const inFlight = useRef(false);
  const fallbackEmitter = useRef<SpidiEventEmitter | null>(null);
  if (!fallbackEmitter.current) fallbackEmitter.current = new SpidiEventEmitter();
  const emitter = providedEmitter ?? fallbackEmitter.current;

  // Refs de callbacks: se actualizan en efecto (no durante el render) para que
  // `emit` sea estable y no reviva efectos ni cierre sobre valores viejos.
  const onSuccessRef = useRef(onSuccess);
  const onEventRef = useRef(onEvent);
  const emitterRef = useRef(emitter);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onEventRef.current = onEvent;
    emitterRef.current = emitter;
  });

  const emit = useCallback((event: SpidiEvent) => {
    onEventRef.current?.(event);
    emitterRef.current.emit(event);
  }, []);

  const previousStatus = useRef<SpidiCheckoutStatus>("loading");
  useEffect(() => {
    if (previousStatus.current === status) return;
    const previous = previousStatus.current;
    previousStatus.current = status;
    emit({ type: "status_change", status, previous });
  }, [status, emit]);

  /** Carga sesión, bancos y comercio. `isActive` corta si el hook se desmontó. */
  const loadSession = useCallback(
    async (isActive: () => boolean) => {
      setStatus("loading");
      setError(null);
      try {
        const [sessionRes, bankList] = await Promise.all([
          client.getSession(sessionId),
          client.getBanks(),
        ]);
        if (!isActive()) return;
        const pos = await client.getPosCommerce(sessionRes.data.pos_commerce_alias);
        if (!isActive()) return;

        posCommerceId.current = pos.data._id;
        const loadedCommerce = sessionRes.commerce ?? pos.commerce ?? null;
        setSession(sessionRes.data);
        setCommerce(loadedCommerce);
        setBanks(bankList);
        emit({
          type: "session_loaded",
          session: sessionRes.data,
          commerce: loadedCommerce,
        });

        if (sessionRes.data.expired === true) {
          const expired = new SpidiError(
            messagesRef.current.sessionExpired,
            "session_expired",
          );
          setError(expired);
          setStatus("failed");
          emit({ type: "error", error: expired });
          return;
        }

        isPaidRef.current = isPaidSession(sessionRes);
        if (isPaidRef.current) {
          // La sesión ya tiene un pago exitoso: no se puede volver a cobrar.
          const paid = { id: sessionRes.data._id };
          setResult(paid);
          setStatus("success");
          emit({ type: "session_paid", result: paid });
          onSuccessRef.current?.(paid);
        } else {
          setStatus("ready");
        }
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

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const productServiceDescription =
    productServiceDescriptionOption ??
    (typeof session?.product_service_description === "string"
      ? session.product_service_description
      : "");

  const amounts = useMemo(
    () =>
      session
        ? {
            usd: session.usd_amount,
            bs: session.bs_amount,
            bcvRate: session.bcv_rate,
            // Listos para pintar; por defecto, convención venezolana.
            usdFormatted: formatAmountOption(session.usd_amount),
            bsFormatted: formatAmountOption(session.bs_amount),
            bcvRateFormatted: formatAmountOption(session.bcv_rate),
          }
        : null,
    [session, formatAmountOption],
  );

  const createTransaction = useCallback(
    async (input: PayerInput) => {
      if (!session || !posCommerceId.current) {
        throw new SpidiError(messages.sessionNotReady, "api");
      }
      const identification = buildIdentification(
        input.identificationType,
        input.identificationNumber,
      );
      const instrument = buildInstrument(input.phonePrefix, input.phoneNumber);

      const created = await client.createTransaction({
        identification,
        amount: formatBsAmount(session.bs_amount),
        bankCode: input.bank.code,
        instrument,
        posCommerceId: posCommerceId.current,
      });

      await client.saveSession({
        _id: session._id,
        usd_amount: session.usd_amount,
        bs_amount: session.bs_amount,
        bcv_rate: session.bcv_rate,
        spidi_commerce_alias: session.spidi_commerce_alias,
        pos_commerce_alias: session.pos_commerce_alias,
        main_currency: session.main_currency,
        transaction_id: created.transactionId,
        payer_payment_id: identification,
        payer_payment_phone: instrument,
        bank_id: input.bank._id,
        ...(created.spidiId ? { spidi_id: created.spidiId } : {}),
        // El backend exige ambos campos aunque vayan vacíos.
        pos_home_url: posHomeUrl,
        product_service_description: productServiceDescription,
      });

      const resent = lastPayer.current !== null;
      lastPayer.current = input;
      const nextTransaction: SpidiTransaction = {
        transactionId: created.transactionId,
        spidiId: created.spidiId,
      };
      setTransaction(nextTransaction);
      setResendIn(resendDelaySeconds);
      emit({
        type: "transaction_created",
        transaction: nextTransaction,
        resent,
      });
    },
    [client, session, resendDelaySeconds, posHomeUrl, productServiceDescription, messages],
  );

  /** Arma el `PayerInput` con lo que hay en `fields` y el catálogo de bancos. */
  const fieldsAsPayer = useCallback((): PayerInput => {
    const bank = banks.find((b) => b._id === fields.bankId);
    return {
      identificationType: fields.identificationType,
      identificationNumber: fields.identificationNumber,
      phonePrefix: fields.phonePrefix,
      phoneNumber: fields.phoneNumber,
      // `validatePayer` reporta "Seleccione un banco" si falta.
      bank: bank as Bank,
    };
  }, [banks, fields]);

  const runValidation = useCallback(
    (input: PayerInput) =>
      validate ? validate(input) : validatePayer(input, messages, phonePrefixes),
    [validate, messages, phonePrefixes],
  );

  const submitPayer = useCallback(
    async (given?: PayerInput) => {
      const input = given ?? fieldsAsPayer();
      const errors = runValidation(input);
      setValidationErrors(errors);
      if (hasErrors(errors)) {
        const failure = new SpidiError(
          Object.values(errors)[0] as string,
          "validation",
          errors,
        );
        setError(failure);
        emit({ type: "validation_failed", errors });
        return;
      }
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      setStatus("creating");
      try {
        await createTransaction(input);
        setStatus("awaiting_otp");
      } catch (e) {
        const failure = toSpidiError(e, messages);
        setError(failure);
        setStatus("ready");
        emit({ type: "error", error: failure });
      } finally {
        inFlight.current = false;
      }
    },
    [createTransaction, fieldsAsPayer, runValidation, messages, emit],
  );

  const resendKey = useCallback(async () => {
    if (!lastPayer.current || resendIn > 0 || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await createTransaction(lastPayer.current);
    } catch (e) {
      setError(toSpidiError(e, messages));
    } finally {
      inFlight.current = false;
    }
  }, [createTransaction, resendIn, messages]);

  const confirmPayment = useCallback(
    async (given?: string) => {
      const key = given ?? fields.key;
      const keyError = validatePaymentKey(key, messages);
      setKeyValidationError(keyError);
      if (keyError) {
        setError(new SpidiError(keyError, "validation", { key: keyError }));
        emit({ type: "validation_failed", errors: { key: keyError } });
        return;
      }
      if (!session || !transaction || !lastPayer.current) {
        setError(new SpidiError(messages.noPendingTransaction, "api"));
        return;
      }
      // Doble click aquí sería un doble intento de débito: se corta en seco.
      if (inFlight.current) return;
      inFlight.current = true;
      const payer = lastPayer.current;
      setError(null);
      setStatus("confirming");
      try {
        const response = await client.confirmPayment(transaction.transactionId, {
          key,
          spidi_transaction: {
            transaction_id: transaction.transactionId,
            usd_amount: session.usd_amount,
            bs_amount: session.bs_amount,
            bcv_rate: session.bcv_rate,
            payer_payment_id: buildIdentification(
              payer.identificationType,
              payer.identificationNumber,
            ),
            payer_payment_phone: buildInstrument(payer.phonePrefix, payer.phoneNumber),
            bank_id: payer.bank._id,
            spidi_session_id: session._id,
            spidi_commerce_alias: session.spidi_commerce_alias,
            pos_commerce_alias: session.pos_commerce_alias,
            main_currency: session.main_currency,
            ...(transaction.spidiId ? { spidi_id: transaction.spidiId } : {}),
            // Obligatorios para el backend, aunque vayan vacíos.
            pos_home_url: posHomeUrl,
            product_service_description: productServiceDescription,
          },
        });

        const rejection = readBankRejection(response);
        const payload: SpidiCheckoutResult = {
          id: response.data?.id,
          errorId: response.data?.spidi_session_error_id,
          rejection,
        };
        setResult(payload);
        if (response.success) {
          isPaidRef.current = true;
          setStatus("success");
          // Métrica de entrega; no debe bloquear ni romper el flujo.
          if (autoAcknowledge) {
            void client.acknowledgePayment(session._id, "success").catch(() => {});
          }
          emit({ type: "payment_succeeded", result: payload });
          onSuccess?.(payload);
        } else {
          const failure = new SpidiError(
            rejection?.userDescription?.trim() ||
              rejection?.developerDescription?.trim() ||
              messages.paymentRejected,
            "payment_rejected",
            rejection,
          );
          setError(failure);
          setStatus("failed");
          emit({ type: "payment_failed", result: payload, error: failure });
          onFailure?.(payload);
        }
      } catch (e) {
        const failure = toSpidiError(e, messages);
        setError(failure);
        setStatus("awaiting_otp");
        emit({ type: "error", error: failure });
      } finally {
        inFlight.current = false;
      }
    },
    [
      client,
      session,
      transaction,
      onSuccess,
      onFailure,
      posHomeUrl,
      productServiceDescription,
      fields.key,
      messages,
      autoAcknowledge,
      emit,
    ],
  );

  const checkStatus = useCallback(async () => {
    const remote = await client.getTransactionStatus(sessionId);
    const payload: SpidiCheckoutResult = {
      id: remote.spidi_transaction?._id,
      errorId: remote.spidi_session_error_id,
    };
    setResult(payload);
    if (remote.status === "paid" || remote.status === "success") {
      isPaidRef.current = true;
      setStatus("success");
      emit({ type: "payment_succeeded", result: payload });
      onSuccess?.(payload);
    } else if (remote.status === "failed") {
      setStatus("failed");
      emit({ type: "payment_failed", result: payload, error: null });
      onFailure?.(payload);
    }
    return payload;
  }, [client, sessionId, onSuccess, onFailure, emit]);

  /**
   * Campo que el usuario tocó de último. Con `validateOn: "change"` la
   * validación se hace en un efecto y no en el propio `onChange`: si no, se
   * validaría el valor anterior, porque el estado todavía no se actualizó.
   */
  const touched = useRef<keyof PayerValidationErrors | null>(null);

  /**
   * Escribe un campo saneando la entrada: en los numéricos no entran letras
   * aunque el integrador no haga nada. Al cambiar de tipo de documento vuelve a
   * sanear la identificación (cédula ⇄ pasaporte tienen reglas distintas).
   */
  const setField = useCallback(
    <K extends keyof PayerFields>(name: K, value: PayerFields[K]) => {
      touched.current = VALIDATION_FIELD[name] ?? null;
      setFields((current) => {
        const next = { ...current, [name]: value } as PayerFields;
        if (name === "identificationType") {
          next.identificationNumber = sanitizeIdentification(
            next.identificationType,
            current.identificationNumber,
          );
        }
        if (name === "identificationNumber") {
          next.identificationNumber = sanitizeIdentification(
            next.identificationType,
            String(value),
          );
        }
        if (name === "phoneNumber") next.phoneNumber = sanitizePhoneNumber(String(value));
        if (name === "key") next.key = sanitizePaymentKey(String(value));
        return next;
      });
    },
    [],
  );

  /** Revalida un campo suelto cuando `validateOn` no es `"submit"`. */
  const revalidateField = useCallback(
    (name: keyof PayerValidationErrors) => {
      const errors = runValidation(fieldsAsPayer());
      // Solo escribe si cambió: si no, el efecto de `validateOn: "change"` se
      // repetiría en bucle porque el objeto de errores sería siempre nuevo.
      setValidationErrors((current) =>
        current[name] === errors[name] ? current : { ...current, [name]: errors[name] },
      );
    },
    [fieldsAsPayer, runValidation],
  );

  useEffect(() => {
    if (validateOn !== "change" || !touched.current) return;
    revalidateField(touched.current);
  }, [fields, validateOn, revalidateField]);

  /** Handlers de validación según `validateOn`. */
  const validationHandlers = useCallback(
    (name: keyof PayerValidationErrors): FieldProps => {
      if (validateOn === "blur") return { onBlur: () => revalidateField(name) };
      // Con "change" no hace falta handler: el efecto revalida tras escribir.
      return {};
    },
    [validateOn, revalidateField],
  );

  const getFormProps = useCallback(
    (props?: FieldProps) =>
      mergeProps(
        {
          ...noStoreFormProps,
          onSubmit: (event: { preventDefault?: () => void }) => {
            event.preventDefault?.();
            // Un solo `onSubmit` sirve a los dos pasos del flujo.
            if (status === "awaiting_otp" || status === "confirming") {
              void confirmPayment();
            } else {
              void submitPayer();
            }
          },
        },
        props,
      ),
    [status, confirmPayment, submitPayer],
  );

  const getIdentificationTypeProps = useCallback(
    (props?: FieldProps) =>
      mergeProps(
        {
          ...noStoreFieldProps,
          value: fields.identificationType,
          onChange: (event: { target: { value: string } }) =>
            setField("identificationType", event.target.value as IdentificationType),
        },
        props,
      ),
    [fields.identificationType, setField],
  );

  const getIdentificationProps = useCallback(
    (props?: FieldProps) =>
      mergeProps(
        {
          ...noStoreFieldProps,
          value: fields.identificationNumber,
          inputMode: fields.identificationType === "P" ? "text" : "numeric",
          "aria-invalid": Boolean(validationErrors.identificationNumber),
          onChange: (event: { target: { value: string } }) =>
            setField("identificationNumber", event.target.value),
          ...validationHandlers("identificationNumber"),
        },
        props,
      ),
    [
      fields.identificationNumber,
      fields.identificationType,
      validationErrors.identificationNumber,
      setField,
      validationHandlers,
    ],
  );

  const getPhonePrefixProps = useCallback(
    (props?: FieldProps) =>
      mergeProps(
        {
          ...noStoreFieldProps,
          value: fields.phonePrefix,
          onChange: (event: { target: { value: string } }) =>
            setField("phonePrefix", event.target.value as PhonePrefix),
        },
        props,
      ),
    [fields.phonePrefix, setField],
  );

  const getPhoneProps = useCallback(
    (props?: FieldProps) =>
      mergeProps(
        {
          ...noStoreFieldProps,
          value: fields.phoneNumber,
          inputMode: "numeric",
          "aria-invalid": Boolean(validationErrors.phoneNumber),
          onChange: (event: { target: { value: string } }) =>
            setField("phoneNumber", event.target.value),
          ...validationHandlers("phoneNumber"),
        },
        props,
      ),
    [fields.phoneNumber, validationErrors.phoneNumber, setField, validationHandlers],
  );

  const getBankProps = useCallback(
    (props?: FieldProps) =>
      mergeProps(
        {
          ...noStoreFieldProps,
          value: fields.bankId,
          "aria-invalid": Boolean(validationErrors.bank),
          onChange: (event: { target: { value: string } }) =>
            setField("bankId", event.target.value),
          ...validationHandlers("bank"),
        },
        props,
      ),
    [fields.bankId, validationErrors.bank, setField, validationHandlers],
  );

  const getKeyProps = useCallback(
    (props?: FieldProps) =>
      mergeProps(
        {
          ...noStoreOtpFieldProps,
          value: fields.key,
          inputMode: "numeric",
          maxLength: 8,
          "aria-invalid": Boolean(keyValidationError),
          onChange: (event: { target: { value: string } }) =>
            setField("key", event.target.value),
        },
        props,
      ),
    [fields.key, keyValidationError, setField],
  );

  const reset = useCallback(() => {
    if (isPaidRef.current) return; // una sesión ya pagada no se puede reutilizar
    lastPayer.current = null;
    setTransaction(null);
    setResult(null);
    setError(null);
    setResendIn(0);
    setValidationErrors({});
    setKeyValidationError(null);
    // La clave es de un intento concreto; los datos del pagador se conservan.
    setFields((current) => ({ ...current, key: "" }));
    setStatus(session ? "ready" : "loading");
  }, [session]);

  return {
    emitter,
    sessionId,
    methods: resolvePaymentMethods(session, enabledMethods),
    status,
    error,
    session,
    commerce,
    banks,
    transaction,
    result,
    amounts,
    validationErrors,
    keyValidationError,
    resendIn,
    canResend: status === "awaiting_otp" && resendIn === 0,
    isBusy: status === "loading" || status === "creating" || status === "confirming",
    fields,
    setField,
    phonePrefixes,
    getFormProps,
    getIdentificationTypeProps,
    getIdentificationProps,
    getPhonePrefixProps,
    getPhoneProps,
    getBankProps,
    getKeyProps,
    load,
    submitPayer,
    resendKey,
    confirmPayment,
    checkStatus,
    reset,
  };
}
