"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { parseUsdt } from "@/lib/spidi/shared";

function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function NewCampaignPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("100");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;

  if (!user) {
    return (
      <p className="muted">
        <Link href="/login">Sign in</Link> to start a campaign.
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;

    const goalUsdt = parseUsdt(goal);
    if (!goalUsdt) {
      setError("Enter a valid goal in USDT.");
      return;
    }
    const deadlineDate = new Date(`${deadline}T23:59:59`);
    if (Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
      setError("Deadline must be in the future.");
      return;
    }

    setBusy(true);
    setError(null);
    // Insert goes through RLS: owner_id must equal auth.uid().
    const { data, error: insertError } = await getSupabaseBrowser()
      .from("campaigns")
      .insert({
        owner_id: user.id,
        title: title.trim(),
        description: description.trim(),
        goal_usdt: goalUsdt,
        deadline: deadlineDate.toISOString(),
        status: "active",
      })
      .select("id")
      .single<{ id: string }>();
    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create the campaign.");
      return;
    }
    router.push(`/campaigns/${data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="stack" style={{ maxWidth: 560 }}>
      <h1>Start a campaign</h1>
      <p className="muted small">
        Pledges are paid to the SPIDI alias on <Link href="/account">your account</Link>. Set it
        before sharing the campaign.
      </p>

      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={120} required />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={5000} />
      </label>

      <label className="field">
        <span>Goal (USDT)</span>
        <input value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" required />
      </label>

      <label className="field">
        <span>Deadline</span>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" className="button" disabled={busy}>
        {busy ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}
