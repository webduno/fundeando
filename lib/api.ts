"use client";

import { getSupabaseBrowser } from "./supabase/browser";

/** fetch() with the current Supabase access token as a Bearer header. */
export async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to sign in first.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
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
