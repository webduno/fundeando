import { NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromRequest } from "@/lib/supabase/server";
import { verifySpidiSession } from "@/lib/spidi/server";
import type { Pledge } from "@/lib/types";

/**
 * POST /api/pledges/:id/confirm
 * Re-checks the pledge's SPIDI session against SPIDI and flips it to `paid`
 * or `expired`. Idempotent: safe to call again from "My pledges" if the
 * browser closed mid-payment. Never trusts the client's claim of success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: pledge, error } = await admin
    .from("pledges")
    .select("id, backer_id, status, spidi_session_id")
    .eq("id", id)
    .maybeSingle<Pick<Pledge, "id" | "backer_id" | "status" | "spidi_session_id">>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pledge) return NextResponse.json({ error: "Pledge not found" }, { status: 404 });
  if (pledge.backer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (pledge.status !== "pending") {
    return NextResponse.json({ status: pledge.status });
  }

  const verdict = await verifySpidiSession(pledge.spidi_session_id);
  if (verdict === "pending") return NextResponse.json({ status: "pending" });

  const update =
    verdict === "paid"
      ? { status: "paid", paid_at: new Date().toISOString() }
      : { status: "expired" };

  const { error: updateError } = await admin
    .from("pledges")
    .update(update)
    .eq("id", pledge.id)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ status: update.status });
}
