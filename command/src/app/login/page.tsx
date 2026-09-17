"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (response.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Wrong password");
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="brand">
        <span className="brand-mark">G</span>
        <span>
          Gather <b>Command</b>
        </span>
      </div>
      <input type="password" placeholder="Admin password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={busy || password.length === 0}>
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
