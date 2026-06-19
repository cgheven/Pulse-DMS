export const metadata = {
  title: "Pricing — Pulse DMS",
  description:
    "Simple, branch-based pricing for dealers across Pakistan. Sales, stock, ledger and reports — every feature in every plan.",
  openGraph: {
    title: "Pulse DMS — Pricing",
    description: "Run your dealership smarter. Branch-based pricing built for Pakistan.",
    type: "website",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
