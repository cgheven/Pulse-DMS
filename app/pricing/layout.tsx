export const metadata = {
  title: "Pricing",
  description:
    "Simple, branch-based pricing for retail shops and distributors. Sales, stock, ledger and reports — every feature in every plan.",
  openGraph: {
    title: "Pricing | Pulse",
    description: "Run your shop smarter. Simple branch-based pricing, starting at $20/mo.",
    type: "website",
    siteName: "Pulse",
    // openGraph is replaced, not merged, per segment — restate the image.
    images: [{ url: "/logo-mark.png", width: 512, height: 512, alt: "Pulse" }],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
