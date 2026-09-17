"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeWait } from "@/lib/login-policy";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      setBusy(false);
      setError("Couldn't reach the server. Check your connection and try again.");
      return;
    }
    setBusy(false);

    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }

    const body = (await response.json().catch(() => ({}))) as {
      retry_after_seconds?: number;
      remaining?: number;
    };
    const wait = body.retry_after_seconds ?? 0;

    if (response.status === 429) {
      setLockedOut(true);
      setError(`Too many attempts. Try again in ${describeWait(wait)}.`);
      return;
    }
    setLockedOut(false);
    if (typeof body.remaining === "number" && body.remaining > 0 && body.remaining <= 2) {
      setError(`Wrong password. ${body.remaining} attempt${body.remaining === 1 ? "" : "s"} left before a lockout.`);
      return;
    }
    setError("Wrong password");
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="brand">
        <span className="brand-mark">G</span>
        <span>
          Gather <b>Command</b>
        </span>
      </div>
      <input
        type="password"
        placeholder="Admin password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setLockedOut(false);
        }}
        autoFocus
      />
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={busy || lockedOut || password.length === 0}>
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
