"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInForm({ googleEnabled, devEnabled }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  return (
    <>
      {googleEnabled && (
        <button onClick={() => signIn("google", { redirectTo: "/" })}>
          Continue with Google
        </button>
      )}

      {googleEnabled && devEnabled && (
        <p className="muted" style={{ textAlign: "center", margin: "0.85rem 0" }}>
          or
        </p>
      )}

      {devEnabled && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) signIn("dev", { email, name, redirectTo: "/" });
          }}
        >
          <p className="muted">
            Dev login (local only) — sign in as any email to test as that user.
          </p>
          <label htmlFor="dev-email">Email</label>
          <input
            id="dev-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@commerce.com"
            required
          />
          <label htmlFor="dev-name">Name (optional)</label>
          <input
            id="dev-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
          <button type="submit" disabled={!email.trim()}>
            Sign in
          </button>
        </form>
      )}

      {!googleEnabled && !devEnabled && (
        <p className="error">
          No sign-in method is configured. Set AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET.
        </p>
      )}
    </>
  );
}
