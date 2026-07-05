export const metadata = {
  title: "Pricing — Pulse DMS",
  description:
    "Simple, branch-based pricing for retail shops and distributors. Sales, stock, ledger and reports — every feature in every plan.",
  openGraph: {
    title: "Pulse DMS — Pricing",
    description: "Run your shop smarter. Simple branch-based pricing, starting at $20/mo.",
    type: "website",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
