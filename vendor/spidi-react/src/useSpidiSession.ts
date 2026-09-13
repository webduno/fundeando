import { useEffect, useMemo, useRef, useState } from "react";
import { SpidiClient, SpidiClientOptions, isPaidSession } from "./client";
import {
  resolvePaymentMethods,
  type ResolvedPaymentMethod,
  type SpidiPaymentMethod,
} from "./methods";
import { Commerce, SpidiError, SpidiSession } from "./types";
import { type SpidiMessages } from "./messages";
import { useStableMessages } from "./useStableMessages";
import { useSpidiClient } from "./useSpidiClient";

export interface UseSpidiSessionOptions extends SpidiClientOptions {
  sessionId: string;
  client?: SpidiClient;
  enabledMethods?: SpidiPaymentMethod[];
  /** Textos del SDK. Se mezclan sobre `DEFAULT_MESSAGES`. */
  messages?: Partial<SpidiMessages>;
}

export interface UseSpidiSessionReturn {
  status: "loading" | "ready" | "paid" | "failed";
  session: SpidiSession | null;
  commerce: Commerce | null;
  methods: ResolvedPaymentMethod[];
  error: SpidiError | null;
}

/**
 * Carga solo la sesión: montos, comercio y métodos disponibles. Sirve para
 * pintar cabecera y pestañas sin montar un flujo de pago completo.
 * El cliente comparte los GET en vuelo, así que no duplica peticiones con
 * `useSpidiCheckout` o `useSpidiCrypto`.
 */
export function useSpidiSession({
  sessionId,
  client: providedClient,
  enabledMethods,
  messages: messagesOption,
  ...clientOptions
}: UseSpidiSessionOptions): UseSpidiSessionReturn {
  const messages = useStableMessages(messagesOption);
  const client = useSpidiClient(providedClient, clientOptions, messages);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [status, setStatus] = useState<UseSpidiSessionReturn["status"]>("loading");
  const [session, setSession] = useState<SpidiSession | null>(null);
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [error, setError] = useState<SpidiError | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError(null);

    client.getSession(sessionId)
      .then((response) => {
        if (!active) return;
        setSession(response.data);
        setCommerce(response.commerce ?? null);
        setStatus(isPaidSession(response) ? "paid" : "ready");
      })
      .catch((e) => {
        if (!active) return;
        setError(
          e instanceof SpidiError
            ? e
            : new SpidiError(messagesRef.current.unexpectedError, "api", e),
        );
        setStatus("failed");
      });

    return () => {
      active = false;
    };
  }, [client, sessionId]);

  const methods = useMemo(
    () => resolvePaymentMethods(session, enabledMethods),
    [session, enabledMethods],
  );

  return { status, session, commerce, methods, error };
}
