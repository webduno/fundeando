import { useRef } from "react";
import { resolveMessages, type SpidiMessages } from "./messages";

/**
 * Resuelve los textos manteniendo la identidad del objeto mientras el contenido
 * no cambie. Sin esto, `messages={{ ... }}` escrito en línea (lo normal) genera
 * un objeto nuevo por render, recrea el cliente y vuelve a disparar la carga.
 */
export function useStableMessages(
  overrides?: Partial<SpidiMessages>,
): SpidiMessages {
  const cache = useRef<{ key: string; value: SpidiMessages } | null>(null);
  const key = JSON.stringify(
    Object.keys(overrides ?? {})
      .sort()
      .map((name) => [
        name,
        String(overrides?.[name as keyof SpidiMessages]),
      ]),
  );

  if (!cache.current || cache.current.key !== key) {
    cache.current = { key, value: resolveMessages(overrides) };
  }
  return cache.current.value;
}
