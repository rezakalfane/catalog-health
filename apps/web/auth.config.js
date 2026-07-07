/**
 * Edge-safe auth config — no database imports, so it can be used by
 * middleware (which runs on the edge runtime and can't load better-sqlite3).
 * The full config in auth.js spreads this and adds the Node-only pieces
 * (the dev-login Credentials provider and the DB-backed jwt callback).
 */
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const googleConfigured =
  Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);
const devLoginEnabled = process.env.NODE_ENV !== "production";

// Only accept company accounts through Google SSO.
const ALLOWED_DOMAIN = process.env.AUTH_ALLOWED_DOMAIN || "commerce.com";

// Dev login: sign in as any email to test as that user. The DB upsert happens
// in the jwt callback (auth.js), so this provider stays edge/middleware-safe.
const devProvider = Credentials({
  id: "dev",
  name: "Dev login",
  credentials: { email: { label: "Email" }, name: { label: "Name" } },
  authorize(creds) {
    if (!creds?.email) return null;
    const email = String(creds.email).trim().toLowerCase();
    return { email, name: creds.name ? String(creds.name) : email };
  },
});

const authConfig = {
  trustHost: true,
  pages: { signIn: "/signin" },
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            // Hint Google to show only company accounts on the picker.
            authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account" } },
          }),
        ]
      : []),
    ...(devLoginEnabled ? [devProvider] : []),
  ],
  callbacks: {
    // Gate every matched route: signed in or bounce to /signin.
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    // Domain restriction for Google (no-op for the dev provider).
    signIn({ account, profile }) {
      if (account?.provider === "google") {
        return Boolean(profile?.email_verified) && String(profile.email).endsWith(`@${ALLOWED_DOMAIN}`);
      }
      return true;
    },
    session({ session, token }) {
      if (token?.uid) session.user.id = token.uid;
      return session;
    },
  },
};

export default authConfig;
