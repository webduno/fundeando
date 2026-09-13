import { useEffect, useMemo, useRef } from "react";
import { SpidiClient, type SpidiClientOptions } from "./client";
import type { SpidiMessages } from "./messages";

function useJsonStable<T>(value: T): T {
  const key = JSON.stringify(value ?? null);
  const ref = useRef({ key, value });
  if (ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}

/**
 * Conserva un cliente mientras su transporte no cambie. Los mensajes pueden
 * actualizarse sin recrearlo; un cliente entregado por el caller nunca se muta.
 */
export function useSpidiClient(
  providedClient: SpidiClient | undefined,
  options: SpidiClientOptions,
  messages: SpidiMessages,
): SpidiClient {
  const headers = useJsonStable(
    options.headers
      ? Object.fromEntries(
          Object.entries(options.headers).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : undefined,
  );
  const hiddenBankCodes = useJsonStable(
    options.hiddenBankCodes
      ? [...options.hiddenBankCodes].sort()
      : undefined,
  );
  const client = useMemo(
    () =>
      providedClient ??
      new SpidiClient({
        environment: options.environment,
        baseUrl: options.baseUrl,
        timeoutMs: options.timeoutMs,
        fetch: options.fetch,
        debug: options.debug,
        onDebug: options.onDebug,
        hiddenBankCodes,
        filterBanks: options.filterBanks,
        headers,
        getAuthToken: options.getAuthToken,
      }),
    [
      providedClient,
      options.environment,
      options.baseUrl,
      options.timeoutMs,
      options.fetch,
      options.debug,
      options.onDebug,
      hiddenBankCodes,
      options.filterBanks,
      headers,
      options.getAuthToken,
    ],
  );

  useEffect(() => {
    if (!providedClient) client.setMessages(messages);
  }, [client, messages, providedClient]);

  return client;
}
