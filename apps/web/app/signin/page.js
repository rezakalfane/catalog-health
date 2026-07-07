import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  // Env is read server-side; the client form only gets booleans.
  const googleEnabled =
    Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);
  const devEnabled = process.env.NODE_ENV !== "production";
  return (
    <div style={{ maxWidth: 380, margin: "4rem auto" }}>
      <h1>Sign in</h1>
      <p className="muted">Catalog Health — sign in to see your environments and analyses.</p>
      <div className="card">
        <SignInForm googleEnabled={googleEnabled} devEnabled={devEnabled} />
      </div>
    </div>
  );
}
