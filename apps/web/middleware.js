/**
 * Gates page routes behind auth (edge runtime — uses the DB-free auth.config).
 * API routes are excluded here and enforce auth in-handler (returning 401
 * instead of redirecting to the sign-in HTML).
 */
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!api|signin|_next/static|_next/image|favicon.ico).*)"],
};
