# Pulse IMS — Project Conventions

## Performance: pages must render with real data on first paint

This app had a recurring problem: pages felt slow because they rendered an
empty shell first and fetched real data client-side afterward (a "fetch
waterfall" — render → mount → `useEffect` fetch → re-render). Every new
page/feature must follow the pattern below instead. Do not wait to be asked
to optimize — this is the default way to build a page here.

### 1. Fetch on the server, pass data down as props

The `page.tsx` (Server Component) fetches real data and passes it to the
Client Component as props. The Client Component seeds `useState` from those
props. It must NOT re-fetch its own initial data in a `useEffect` on mount.

Reference implementation: `app/(dashboard)/sales/page.tsx` +
`components/modules/sales/sales-client.tsx`, or
`app/(dashboard)/pl-report/page.tsx`. The `insights` module was the original
correct pattern everything else was brought in line with.

```tsx
// app/(dashboard)/<feature>/page.tsx
export const dynamic = "force-dynamic";

export default async function FeaturePage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.branchId) redirect("/dashboard");

  const initialData = await getFeatureData(ctx.branchId);

  return <FeatureClient key={ctx.branchId} initialData={initialData} />;
}
```

A Client Component may still re-fetch on explicit user action (date range
change, filter change, pagination) via a server action — that's fine and
expected. What's not allowed is fetching the *initial* view of the page
client-side.

### 2. Key multi-tenant components by `branchId` (or shop/tenant id)

Any Client Component seeded from server props that varies by branch must be
rendered with `key={branchId}`. Switching branches calls `router.refresh()`,
which re-runs the Server Component with the new branch — but without a `key`
change, the Client Component instance survives and its `useState` keeps the
*old* branch's data until some other effect happens to overwrite it. This is
a documented React pattern: "Resetting state with a key."

```tsx
return <FeatureClient key={branchId ?? "no-branch"} initialData={initialData} />;
```

If a component genuinely needs no local state for the server-fetched value
(e.g. `dashboard-client.tsx`), just use the prop directly — `const stats =
initialStats` — with no `useState` at all. No state, no staleness, no key
needed.

### 3. Dedup the per-request auth check with React `cache()`

Portal layouts (rider, sales-rep, admin dashboard) and every data-fetching
function on a page each independently need the authenticated user. Wrap the
auth lookup in React's `cache()` so one `auth.getUser()` round-trip is shared
across the whole request instead of repeating per call site.

Reference: `getRiderAuthContext` in `app/actions/rider.ts`,
`getSalesAuthContext` in `app/actions/sales-rep.ts`, `getAuthContext` in
`lib/data.ts`.

```ts
export const getFeatureAuthContext = cache(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // ...profile/role lookups
  return { user, profile };
});
```

Do not add a cross-request cache (e.g. `unstable_cache`) around the auth
token check itself — that would risk serving one user's session to another.
Middleware's own `auth.getUser()` call is intentionally left uncached
everywhere, since it's also what silently refreshes the session token.

### 4. Cache expensive aggregate reads, but invalidate them on every mutation

Aggregate/rollup reads (dashboard stats, P&L report, supplier balances —
anything that scans/sums a lot of rows) should be wrapped in `unstable_cache`
keyed by branch (+ any other params), with a short `revalidate` TTL as a
safety net. Reference: `getDashboardStats`, `getPLReport`,
`getSupplierBalances` in `lib/data.ts`, which export tag helpers:

```ts
export const dashboardStatsTag = (branchId: string) => `dashboard-stats-${branchId}`;
```

Every server action that creates/updates/deletes data feeding one of these
aggregates MUST call `revalidateTag(...)` for every affected tag, in addition
to any existing `revalidatePath(...)` calls, so the next read is correct
immediately rather than waiting out the TTL:

```ts
revalidatePath("/sales");
revalidatePath("/dashboard");
revalidatePath("/stock");
revalidateTag(dashboardStatsTag(branchId));
revalidateTag(plReportTag(branchId));
```

When adding a new aggregate cache, add its tag helper next to the existing
ones in `lib/data.ts` and wire `revalidateTag` into every mutation that can
change its inputs — grep the existing tag helpers for all current call sites
before adding a new one, so nothing is missed.

### Checklist for any new page/feature

- [ ] Server Component fetches real data before rendering; no `useEffect`
      fetch for the page's initial view.
- [ ] Client Component keyed by `branchId` if it holds branch-scoped state.
- [ ] Auth/profile lookup wrapped in React `cache()`, not repeated raw.
- [ ] If the read is an expensive aggregate, wrap it in `unstable_cache` with
      a tag, and call `revalidateTag` from every mutation that affects it.
- [ ] Run `npx tsc --noEmit` and manually verify no stale data after
      switching branches before calling it done.
