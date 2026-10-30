import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const SITE_TITLE = "Pulse - Inventory Management System";
const SITE_DESCRIPTION =
  "Pulse is inventory and sales management software for retail shops and distributors — track stock, sales, and delivery across every branch in real time.";

// Favicon and Apple touch icon come from the file conventions app/icon.png
// and app/apple-icon.png; Next.js emits their <link> tags automatically.
export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s | Pulse",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Pulse",
  authors: [{ name: "PulseHub (SMC-Private) Limited" }],
  openGraph: {
    type: "website",
    siteName: "Pulse",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/logo-mark.png", width: 512, height: 512, alt: "Pulse" }],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/logo-mark.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
