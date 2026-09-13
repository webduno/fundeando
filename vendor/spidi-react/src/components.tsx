import { createContext, useContext, type ReactNode } from "react";
import {
  useSpidiCheckout,
  type SpidiCheckoutStatus,
  type UseSpidiCheckoutOptions,
  type UseSpidiCheckoutReturn,
} from "./useSpidiCheckout";

const SpidiCheckoutContext = createContext<UseSpidiCheckoutReturn | null>(null);

export function useSpidiCheckoutContext(): UseSpidiCheckoutReturn {
  const ctx = useContext(SpidiCheckoutContext);
  if (!ctx) {
    throw new Error("useSpidiCheckoutContext debe usarse dentro de <SpidiCheckoutProvider>.");
  }
  return ctx;
}

export interface SpidiCheckoutProviderProps extends UseSpidiCheckoutOptions {
  children: ReactNode | ((checkout: UseSpidiCheckoutReturn) => ReactNode);
}

/** Provee el estado del checkout. No renderiza markup ni estilos. */
export function SpidiCheckoutProvider({
  children,
  ...options
}: SpidiCheckoutProviderProps) {
  const checkout = useSpidiCheckout(options);
  return (
    <SpidiCheckoutContext.Provider value={checkout}>
      {typeof children === "function" ? children(checkout) : children}
    </SpidiCheckoutContext.Provider>
  );
}

export interface SpidiWhenProps {
  status: SpidiCheckoutStatus | SpidiCheckoutStatus[];
  children: ReactNode | ((checkout: UseSpidiCheckoutReturn) => ReactNode);
}

/** Renderiza sus hijos solo cuando el checkout está en alguno de los estados dados. */
export function SpidiWhen({ status, children }: SpidiWhenProps) {
  const checkout = useSpidiCheckoutContext();
  const allowed = Array.isArray(status) ? status : [status];
  if (!allowed.includes(checkout.status)) return null;
  return <>{typeof children === "function" ? children(checkout) : children}</>;
}
