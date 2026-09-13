import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Anonymous server client. Only sees what RLS allows `anon` to see. */
export function getSupabaseAnon(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseAnonKey(), noSession);
}

/** Service-role client. Bypasses RLS. Server only. */
export function getSupabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(supabaseUrl(), key, noSession);
}

/**
 * Resolves the user from a `Authorization: Bearer <access_token>` header.
 * Returns null when missing or invalid.
 */
export async function getUserFromRequest(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  const { data, error } = await getSupabaseAnon().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
