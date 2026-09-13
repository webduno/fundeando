/**
 * Entrada sin React: cliente HTTP, validaciones y tipos.
 * Útil desde Node, workers o cualquier framework.
 */
export {
  SpidiClient,
  SPIDI_ENVIRONMENTS,
  DEFAULT_HIDDEN_BANK_CODES,
  buildIdentification,
  buildInstrument,
  formatAmount,
  formatBsAmount,
  isPaidSession,
  type SpidiClientOptions,
  type SpidiDebugEvent,
  type SpidiEnvironment,
} from "./client";
export * from "./brand";
export * from "./messages";
export * from "./methods";
export * from "./validation";
export * from "./types";
