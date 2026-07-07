/**
 * Full auth config (Node runtime). Spreads the edge-safe base (providers +
 * gating/session callbacks) and adds the jwt callback, which upserts the
 * signed-in user into our own `users` table and stamps the DB user id onto
 * the token. The DB import is dynamic so the base config stays edge-safe for
 * middleware.
 *
 * Providers (Google when configured, Dev login in non-production) live in
 * auth.config so middleware and the route handler share one definition.
 */
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // `user` is present only on initial sign-in. Map the identity to a row
      // in our users table and carry its id on the token thereafter.
      if (user?.email) {
        const { getOrCreateUser } = await import("@/lib/db");
        const dbUser = getOrCreateUser({ email: user.email, name: user.name });
        token.uid = dbUser.id;
      }
      return token;
    },
  },
});
