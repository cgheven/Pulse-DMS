import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  BarChart3,
  Users,
  Settings,
  ShoppingBag,
} from "lucide-react";

// Illustrative sparkline points for the "Stock Overview" chart — a static
// marketing preview, not live data.
const CHART_POINTS = [40, 65, 55, 90, 70, 100, 85, 130];
const CHART_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildLinePath(points: number[], width: number, height: number) {
  const max = Math.max(...points);
  const step = width / (points.length - 1);
  return points
    .map((p, i) => {
      const x = i * step;
      const y = height - (p / max) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const STOCK_MIX = [
  { label: "Electronics", pct: 42, color: "#f5a623" },
  { label: "Groceries", pct: 27, color: "#38bdf8" },
  { label: "Household", pct: 19, color: "#a78bfa" },
  { label: "Others", pct: 12, color: "#34d399" },
] as const;

function donutGradient() {
  let acc = 0;
  const stops = STOCK_MIX.map((s) => {
    const start = acc;
    acc += s.pct;
    return `${s.color} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

const RAIL_ICONS = [
  { icon: LayoutDashboard, active: true },
  { icon: ShoppingCart, active: false },
  { icon: Boxes, active: false },
  { icon: BarChart3, active: false },
  { icon: Users, active: false },
  { icon: Settings, active: false },
] as const;

export function DashboardPreview() {
  const width = 320;
  const height = 90;
  const linePath = buildLinePath(CHART_POINTS, width, height);
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <div
      aria-hidden
      className="select-none pointer-events-none rounded-2xl border border-sidebar-border bg-card/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden flex"
    >
      {/* Icon rail */}
      <div className="hidden sm:flex flex-col items-center gap-2 py-5 px-3 border-r border-sidebar-border/80 bg-sidebar/40">
        {RAIL_ICONS.map(({ icon: Icon, active }, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              active ? "bg-primary/15 border border-primary/30" : ""
            }`}
          >
            <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
          </div>
        ))}
      </div>

      <div className="flex-1 p-5 space-y-4 min-w-0">
        <p className="text-sm font-bold text-foreground">Dashboard</p>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: "Total Products", value: "2,143", delta: "+12%", up: true },
            { label: "Low Stock", value: "23", delta: "+5%", up: false },
            { label: "Today's Sales", value: "156", delta: "+18%", up: true },
            { label: "Outstanding", value: "PKR 84K", delta: "-2%", up: true },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-sidebar-border bg-background/60 p-3">
              <p className="text-[10px] text-muted-foreground truncate">{s.label}</p>
              <p className="text-base font-bold text-foreground tabular-nums mt-0.5">{s.value}</p>
              <p className={`text-[10px] font-semibold mt-0.5 ${s.up ? "text-emerald-400" : "text-red-400"}`}>
                {s.up ? "↑" : "↓"} {s.delta}
              </p>
            </div>
          ))}
        </div>

        {/* Chart + donut */}
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-2.5">
          <div className="rounded-xl border border-sidebar-border bg-background/60 p-3.5">
            <p className="text-xs font-semibold text-foreground mb-2">Stock Overview</p>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dp-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f5a623" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#f5a623" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#dp-area)" />
              <path d={linePath} fill="none" stroke="#f5a623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex justify-between mt-1">
              {CHART_DAYS.map((d) => (
                <span key={d} className="text-[9px] text-muted-foreground/60">{d}</span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-sidebar-border bg-background/60 p-3.5">
            <p className="text-xs font-semibold text-foreground mb-2.5">Stock Mix</p>
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-full shrink-0"
                style={{ background: donutGradient() }}
              >
                <div className="w-7 h-7 rounded-full bg-card m-auto translate-y-[14px]" />
              </div>
              <div className="space-y-1 min-w-0">
                {STOCK_MIX.map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-muted-foreground truncate">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-sidebar-border bg-background/60 p-3.5">
          <p className="text-xs font-semibold text-foreground mb-2.5">Recent Activity</p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">New Sale #INV-2451</p>
              <p className="text-[10px] text-muted-foreground">2 min ago</p>
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 shrink-0">
              Completed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
