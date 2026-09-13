"use client";

import { getSupabaseBrowser } from "./supabase/browser";

function withJsonHeaders(init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

/** fetch() with the current Supabase access token as a Bearer header. */
export async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to sign in first.");

  const headers = withJsonHeaders(init);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * Same as fetch, but attaches a Bearer token when the user is signed in.
 * Used for pledges so guests can create/confirm without an account.
 */
export async function optionalAuthFetch(input: string, init: RequestInit = {}) {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const headers = withJsonHeaders(init);
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(json?.error || `Request failed (${response.status})`);
  }
  return json as T;
}
