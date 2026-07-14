import "./globals.css";
import Link from "next/link";
import { auth } from "@/auth";
import UserMenu from "@/components/UserMenu";

export const metadata = {
  title: "Catalog Health",
  description: "BigCommerce catalog health & AI-readiness analyzer",
};

export default async function RootLayout({ children }) {
  const session = await auth();
  return (
    // VWO (and similar third-party scripts/extensions) inject attributes like
    // `vwo-smartcode-listener` onto <html> before React hydrates; suppress the
    // benign attribute-only hydration warning that causes.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">
          <nav className="sidebar" aria-label="Primary navigation">
            <div className="brand">
              Catalog<span>Health</span>
            </div>
            <Link href="/">Dashboard</Link>
            <Link href="/analyses/new">New analysis</Link>
            <div className="sidebar-section" role="group" aria-labelledby="sidebar-settings-label">
              <span className="sidebar-section-title" id="sidebar-settings-label">Settings</span>
              <div className="sidebar-subnav">
                <Link href="/environments">Environments</Link>
                <Link href="/settings">Models</Link>
                <Link href="/profiles">Profiles</Link>
              </div>
            </div>
            <div style={{ marginTop: "auto" }}>
              <UserMenu email={session?.user?.email} />
            </div>
          </nav>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
