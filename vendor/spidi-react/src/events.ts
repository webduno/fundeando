import {
  Commerce,
  SpidiCheckoutResult,
  SpidiCheckoutStatus,
  SpidiCryptoStatus,
  SpidiError,
  SpidiSession,
  SpidiTransaction,
} from "./types";
import type { PayerValidationErrors } from "./validation";

export type SpidiEvent =
  | {
      type: "status_change";
      status: SpidiCheckoutStatus | SpidiCryptoStatus;
      previous: SpidiCheckoutStatus | SpidiCryptoStatus;
    }
  | { type: "session_loaded"; session: SpidiSession; commerce: Commerce | null }
  | { type: "session_paid"; result: SpidiCheckoutResult }
  /** La transacción se creó y el banco envió la clave de pago. */
  | { type: "transaction_created"; transaction: SpidiTransaction; resent: boolean }
  | { type: "payment_succeeded"; result: SpidiCheckoutResult }
  | { type: "payment_failed"; result: SpidiCheckoutResult; error: SpidiError | null }
  | { type: "validation_failed"; errors: PayerValidationErrors | { key: string } }
  | { type: "error"; error: SpidiError };

export type SpidiEventType = SpidiEvent["type"];

export type SpidiEventListener<T extends SpidiEventType = SpidiEventType> = (
  event: Extract<SpidiEvent, { type: T }>,
) => void;

/**
 * Emisor de eventos del checkout. Suscríbete a un tipo concreto o a `"*"` para
 * recibir todos. `on` devuelve la función para desuscribirse.
 */
export class SpidiEventEmitter {
  private listeners = new Map<string, Set<(event: SpidiEvent) => void>>();

  on<T extends SpidiEventType>(type: T, listener: SpidiEventListener<T>): () => void;
  on(type: "*", listener: (event: SpidiEvent) => void): () => void;
  on(type: string, listener: (event: never) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as (event: SpidiEvent) => void);
    this.listeners.set(type, set);
    return () => this.off(type as SpidiEventType, listener as never);
  }

  once<T extends SpidiEventType>(type: T, listener: SpidiEventListener<T>): () => void {
    const unsubscribe = this.on(type, ((event: SpidiEvent) => {
      unsubscribe();
      (listener as (event: SpidiEvent) => void)(event);
    }) as SpidiEventListener<T>);
    return unsubscribe;
  }

  off(type: SpidiEventType | "*", listener: (event: never) => void): void {
    this.listeners.get(type)?.delete(listener as (event: SpidiEvent) => void);
  }

  removeAllListeners(type?: SpidiEventType | "*"): void {
    if (type) this.listeners.delete(type);
    else this.listeners.clear();
  }

  emit(event: SpidiEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    for (const listener of this.listeners.get("*") ?? []) listener(event);
  }
}
