"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "./env";

let browserClient: SupabaseClient | null = null;

/** Singleton browser client. Session lives in localStorage; RLS applies. */
export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createClient(supabaseUrl(), supabasePublishableKey());
  return browserClient;
}
