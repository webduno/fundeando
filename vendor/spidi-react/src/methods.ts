import { SpidiSession } from "./types";

export type SpidiPaymentMethod = "immediate_debit" | "crypto" | "mobile_payment";

export const SPIDI_PAYMENT_METHODS: SpidiPaymentMethod[] = [
  "immediate_debit",
  "crypto",
  "mobile_payment",
];

export interface ResolvedPaymentMethod {
  method: SpidiPaymentMethod;
  /** `true` si se puede usar: la sesión lo permite y el integrador no lo apagó. */
  available: boolean;
  /** Por qué no está disponible. */
  reason?: "not_allowed_by_session" | "disabled_by_integration" | "not_implemented";
}

/** Métodos que este SDK sabe ejecutar hoy. */
const IMPLEMENTED: SpidiPaymentMethod[] = ["immediate_debit", "crypto"];

/**
 * Cruza lo que permite la sesión (`allowed_payment_methods`) con lo que el
 * integrador habilita. Sin `enabled`, se permiten todos los de la sesión.
 */
export function resolvePaymentMethods(
  session: Pick<SpidiSession, "allowed_payment_methods"> | null,
  enabled?: SpidiPaymentMethod[],
): ResolvedPaymentMethod[] {
  const allowedBySession = session?.allowed_payment_methods ?? [];

  return SPIDI_PAYMENT_METHODS.map((method) => {
    if (!IMPLEMENTED.includes(method)) {
      return { method, available: false, reason: "not_implemented" as const };
    }
    if (!allowedBySession.includes(method)) {
      return { method, available: false, reason: "not_allowed_by_session" as const };
    }
    if (enabled && !enabled.includes(method)) {
      return { method, available: false, reason: "disabled_by_integration" as const };
    }
    return { method, available: true };
  });
}

export function isMethodAvailable(
  session: Pick<SpidiSession, "allowed_payment_methods"> | null,
  method: SpidiPaymentMethod,
  enabled?: SpidiPaymentMethod[],
): boolean {
  return (
    resolvePaymentMethods(session, enabled).find((m) => m.method === method)?.available ??
    false
  );
}
