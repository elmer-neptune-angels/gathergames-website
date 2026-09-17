import type { Metadata, Viewport } from "next";
import Shell from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gather Command",
  description: "Metrics, monitoring and controls for the Gather family games app",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#14191A" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
