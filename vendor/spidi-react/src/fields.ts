/**
 * Props para que el navegador (y los gestores de contraseñas) no guarden ni
 * autocompleten los datos sensibles del checkout: cédula, teléfono, banco y
 * clave de pago.
 *
 * El SDK no persiste nada por su cuenta (ni localStorage, ni cookies): estas
 * props solo cubren el almacenamiento que hace el navegador desde el formulario.
 */
export const noStoreFieldProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  /** LastPass */
  "data-lpignore": "true",
  /** 1Password */
  "data-1p-ignore": "",
  /** Bitwarden */
  "data-bwignore": "true",
} as const;

/**
 * Igual que `noStoreFieldProps`, pero para la clave de pago (OTP): Chrome ignora
 * `autocomplete="off"` en campos que parecen credenciales, por lo que se usa
 * `one-time-code` y se desactiva el guardado del navegador.
 */
export const noStoreOtpFieldProps = {
  ...noStoreFieldProps,
  autoComplete: "one-time-code",
  inputMode: "numeric",
  name: "spidi-payment-key",
} as const;

/** Props para el `<form>` que contiene los campos. */
export const noStoreFormProps = {
  autoComplete: "off",
} as const;
