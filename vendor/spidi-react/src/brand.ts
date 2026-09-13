/**
 * Atribución de marca. El SDK no pinta nada: solo entrega los atributos del
 * logo para que el integrador lo coloque donde quiera, normalmente al pie del
 * checkout.
 *
 * El logo se sirve desde el dominio de SPIDI en vez de empaquetarse: así no se
 * redistribuye la marca de un tercero dentro del paquete, y el archivo sigue
 * siendo el que SPIDI publique.
 */

export const SPIDI_LOGO_URL = "https://mispidi.com/images/logo.svg";

/** Sitio de SPIDI, para enlazar el logo. */
export const SPIDI_HOME_URL = "https://www.mispidi.com/home";

/** Atributos del enlace que envuelve al logo. */
export interface SpidiBrandLinkProps {
  href: string;
  target: string;
  /** Cierra el acceso a `window.opener` desde la pestaña nueva. */
  rel: string;
  [attribute: string]: unknown;
}

/**
 * Devuelve los atributos del enlace al sitio de SPIDI.
 *
 * ```tsx
 * <a {...getSpidiBrandLinkProps()}><img {...getSpidiBrandProps()} /></a>
 * ```
 */
export function getSpidiBrandLinkProps(
  overrides?: Partial<SpidiBrandLinkProps>,
): SpidiBrandLinkProps {
  return {
    href: SPIDI_HOME_URL,
    target: "_blank",
    rel: "noopener noreferrer",
    ...overrides,
  };
}

/** Atributos de `<img>` para el logo de SPIDI. */
export interface SpidiBrandProps {
  src: string;
  alt: string;
  loading: "lazy" | "eager";
  decoding: "async" | "sync" | "auto";
  [attribute: string]: unknown;
}

/**
 * Devuelve los atributos del logo, con lo que se pase encima.
 *
 * ```tsx
 * <img {...getSpidiBrandProps({ height: 20 })} />
 * ```
 */
export function getSpidiBrandProps(
  overrides?: Partial<SpidiBrandProps>,
): SpidiBrandProps {
  return {
    src: SPIDI_LOGO_URL,
    alt: "SPIDI",
    loading: "lazy",
    decoding: "async",
    ...overrides,
  };
}
