"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function NavBar() {
  const { user, ready, signOut } = useAuth();

  return (
    <header className="nav">
      <Link href="/" className="brand">
        kickstart
      </Link>
      <nav className="nav-links">
        <Link href="/campaigns/new">Start a campaign</Link>
        {ready && user && <Link href="/account">Account</Link>}
        {ready && user && (
          <button type="button" className="link-button" onClick={() => void signOut()}>
            Sign out
          </button>
        )}
        {ready && !user && <Link href="/login">Sign in</Link>}
      </nav>
    </header>
  );
}
