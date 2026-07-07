import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Catalog Health",
  description: "BigCommerce catalog health & AI-readiness analyzer",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
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
          <nav className="sidebar">
            <div className="brand">
              Catalog<span>Health</span>
            </div>
            <Link href="/">Dashboard</Link>
            <Link href="/environments">Environments</Link>
            <Link href="/analyses/new">New analysis</Link>
          </nav>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
