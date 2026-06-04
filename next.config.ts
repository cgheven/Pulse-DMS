import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-XSS-Protection",          value: "1; mode=block" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  compress: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Tree-shake icon and chart imports — ships only what's used
    optimizePackageImports: ["lucide-react", "recharts", "@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-label"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Proxy member photos through our own domain so the Supabase storage URL
  // (project ref) never appears in member-facing image links. Stored
  // photo_url values are relative (/media/member-photos/...) and Next.js
  // streams them from Supabase server-side.
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return [];
    return [
      {
        source: "/media/member-photos/:path*",
        destination: `${supabaseUrl}/storage/v1/object/public/member-photos/:path*`,
      },
    ];
  },
};

export default nextConfig;
