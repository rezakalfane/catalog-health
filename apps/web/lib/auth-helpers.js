/**
 * Server-side helpers to resolve and require the current user.
 *   - Pages (RSC): requireUser() → redirects to /signin when absent.
 *   - API routes: getApiUser() → returns the user or null (caller sends 401).
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** The signed-in user for a Server Component, or redirect to sign-in. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user;
}

/** The signed-in user for an API route, or null. */
export async function getApiUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}
