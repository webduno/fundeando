import { DEFAULT_MESSAGES, type SpidiMessages } from "./messages";
import { IdentificationType, PhonePrefix } from "./types";

export const PHONE_PREFIXES: PhonePrefix[] = [
  "0412",
  "0422",
  "0414",
  "0424",
  "0416",
  "0426",
];

const DOCUMENT_PATTERN = /^\d{7,9}$/;
const PASSPORT_PATTERN = /^[a-zA-Z0-9]{6,15}$/;
const PHONE_PATTERN = /^\d{7}$/;
const PAYMENT_KEY_PATTERN = /^\d{8}$/;

/**
 * Mismas reglas que el checkout oficial. Devuelve el mensaje de error o `null`.
 * `messages` permite traducir o reescribir los textos sin forkear el SDK.
 */
export function validateIdentification(
  type: IdentificationType,
  value: string,
  messages: SpidiMessages = DEFAULT_MESSAGES,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return messages.identificationRequired;
  if (type === "P") {
    return PASSPORT_PATTERN.test(trimmed) ? null : messages.passportInvalid;
  }
  return DOCUMENT_PATTERN.test(trimmed) ? null : messages.identificationInvalid;
}

export function validatePhonePrefix(
  prefix: string,
  messages: SpidiMessages = DEFAULT_MESSAGES,
  prefixes: readonly string[] = PHONE_PREFIXES,
): string | null {
  if (!prefix) return messages.phonePrefixRequired;
  return prefixes.includes(prefix) ? null : messages.phonePrefixInvalid;
}

export function validatePhoneNumber(
  value: string,
  messages: SpidiMessages = DEFAULT_MESSAGES,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return messages.phoneRequired;
  return PHONE_PATTERN.test(trimmed) ? null : messages.phoneInvalid;
}

export function validateBank(
  bankId: string | null | undefined,
  messages: SpidiMessages = DEFAULT_MESSAGES,
): string | null {
  return bankId ? null : messages.bankRequired;
}

export function validatePaymentKey(
  value: string,
  messages: SpidiMessages = DEFAULT_MESSAGES,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return messages.keyRequired;
  return PAYMENT_KEY_PATTERN.test(trimmed) ? null : messages.keyInvalid;
}

/** Deja solo dígitos y recorta a `maxLength`. Para usar en `onChange`. */
export function sanitizeDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

/** Cédula: solo dígitos (máx. 9). Pasaporte: alfanumérico (máx. 15). */
export function sanitizeIdentification(
  type: IdentificationType,
  value: string,
): string {
  return type === "P"
    ? value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15)
    : sanitizeDigits(value, 9);
}

/** Teléfono sin el prefijo: 7 dígitos. */
export function sanitizePhoneNumber(value: string): string {
  return sanitizeDigits(value, 7);
}

/** Clave de pago: 8 dígitos. */
export function sanitizePaymentKey(value: string): string {
  return sanitizeDigits(value, 8);
}

export interface PayerValidationErrors {
  identificationNumber?: string;
  phonePrefix?: string;
  phoneNumber?: string;
  bank?: string;
}

export interface PayerValidationInput {
  identificationType: IdentificationType;
  identificationNumber: string;
  phonePrefix: string;
  phoneNumber: string;
  bank?: { _id?: string } | null;
}

export function validatePayer(
  input: PayerValidationInput,
  messages: SpidiMessages = DEFAULT_MESSAGES,
  prefixes: readonly string[] = PHONE_PREFIXES,
): PayerValidationErrors {
  const errors: PayerValidationErrors = {};
  const identificationNumber = validateIdentification(
    input.identificationType,
    input.identificationNumber,
    messages,
  );
  const phonePrefix = validatePhonePrefix(input.phonePrefix, messages, prefixes);
  const phoneNumber = validatePhoneNumber(input.phoneNumber, messages);
  const bank = validateBank(input.bank?._id, messages);

  if (identificationNumber) errors.identificationNumber = identificationNumber;
  if (phonePrefix) errors.phonePrefix = phonePrefix;
  if (phoneNumber) errors.phoneNumber = phoneNumber;
  if (bank) errors.bank = bank;
  return errors;
}

export function hasErrors(errors: PayerValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
