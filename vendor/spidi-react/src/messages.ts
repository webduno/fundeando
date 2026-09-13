/**
 * Todos los textos que el SDK puede producir. Se sobrescriben por completo o
 * de a uno con la opción `messages` de los hooks y del cliente:
 *
 *   useSpidiCheckout({ sessionId, messages: { bankRequired: "Pick a bank" } })
 *
 * Los que llevan parámetros son funciones para no obligar a interpolar strings.
 */
export interface SpidiMessages {
  // ── Validación del formulario ──────────────────────────────────────────
  identificationRequired: string;
  identificationInvalid: string;
  passportInvalid: string;
  phonePrefixRequired: string;
  phonePrefixInvalid: string;
  phoneRequired: string;
  phoneInvalid: string;
  bankRequired: string;
  keyRequired: string;
  keyInvalid: string;

  // ── Flujo del checkout ─────────────────────────────────────────────────
  sessionExpired: string;
  sessionNotFound: string;
  sessionNotReady: string;
  noPendingTransaction: string;
  paymentRejected: string;
  unexpectedError: string;

  // ── Flujo cripto ───────────────────────────────────────────────────────
  cryptoUnexpectedError: string;
  cryptoPaymentNotReceived: string;
  cryptoNotCredited: string;
  cryptoOrderFailed: string;
  cryptoStatusFailed: string;

  // ── Transporte y API ───────────────────────────────────────────────────
  offline: string;
  timeout: string;
  networkError: string;
  apiError: string;
  invalidIdentification: string;
  bankUnavailable: string;
  receiptNotFound: string;
  statusCheckFailed: string;
  /** Ej.: `(500) => "HTTP 500 al contactar SPIDI."` */
  httpError: (status: number) => string;
}

export const DEFAULT_MESSAGES: SpidiMessages = {
  identificationRequired: "Complete los datos del número de identificación",
  identificationInvalid: "El número de identificación debe tener entre 7 y 9 dígitos",
  passportInvalid: "El pasaporte debe tener entre 6 y 15 caracteres alfanuméricos",
  phonePrefixRequired: "Seleccione el código del teléfono",
  phonePrefixInvalid: "Código telefónico inválido",
  phoneRequired: "Complete los datos del teléfono",
  phoneInvalid: "El número telefónico debe tener 7 dígitos",
  bankRequired: "Seleccione un banco",
  keyRequired: "Ingrese la clave de pago",
  keyInvalid: "La clave de pago debe contener 8 dígitos",

  sessionExpired: "La sesión de pago expiró.",
  sessionNotFound: "No se encontró una sesión de pago activa.",
  sessionNotReady: "La sesión de pago aún no está lista.",
  noPendingTransaction: "No hay una transacción pendiente.",
  paymentRejected: "El banco rechazó el pago.",
  unexpectedError: "Error inesperado en el checkout SPIDI.",

  cryptoUnexpectedError: "Error inesperado en el pago cripto.",
  cryptoPaymentNotReceived:
    "Todavía no vemos el pago. Completa la orden en Binance e intenta de nuevo.",
  cryptoNotCredited: "No se pudo acreditar el pago cripto.",
  cryptoOrderFailed: "No se pudo crear la orden cripto.",
  cryptoStatusFailed: "No se pudo consultar la orden cripto.",

  offline: "Sin conexión a internet.",
  timeout: "La solicitud tardó demasiado.",
  networkError: "Error de red al contactar SPIDI.",
  apiError: "Error de la plataforma SPIDI.",
  invalidIdentification: "Número de identificación inválido.",
  bankUnavailable: "La plataforma bancaria presenta un inconveniente. Intenta de nuevo.",
  receiptNotFound: "No se encontró el comprobante.",
  statusCheckFailed: "No se pudo consultar el estado.",
  httpError: (status: number) => `HTTP ${status} al contactar SPIDI.`,
};

/** Mezcla los textos propios sobre los de fábrica. */
export function resolveMessages(
  overrides?: Partial<SpidiMessages>,
): SpidiMessages {
  return overrides ? { ...DEFAULT_MESSAGES, ...overrides } : DEFAULT_MESSAGES;
}
