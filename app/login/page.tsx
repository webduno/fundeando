"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace("/account");
  }, [ready, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // Always the page you're on (local or Vercel). Do not bake NEXT_PUBLIC_SITE_URL
    // into the email link — that was sending prod users to localhost.
    const { error: signInError } = await getSupabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/account` },
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="stack" style={{ maxWidth: 420 }}>
        <h1>Check your email</h1>
        <p className="muted">We sent a magic link to {email}. Open it on this device.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="stack" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p className="muted small">No password. You get a magic link by email.</p>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );
}
