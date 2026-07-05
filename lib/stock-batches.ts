// ─── Shared FIFO batch calculation ─────────────────────────────────────────────
// Pure, framework-agnostic logic used both server-side (page.tsx, to compute the
// initial batch breakdown) and client-side (stock-client.tsx, to recompute after
// a stock movement is added). Keep this dependency-free so it's safe to import
// from a Server Component.

export type StockBatchMovement = {
  type: string;
  quantity: number;
  unit_price: number | null;
  created_at: string;
};

export type BatchRow = { date: string; unitPrice: number | null; remaining: number };

/**
 * Computes remaining FIFO batches from a (possibly time-bounded) list of
 * movements for a single product.
 *
 * `openingStock`, when provided, is the authoritative current stock level for
 * the product (from dms_stock_levels). Because the movements passed in may be
 * windowed (e.g. last 12 months) rather than the product's entire history, the
 * computed remaining total can undershoot the real current stock if older
 * "in" batches (from before the window) are still partially unconsumed. In
 * that case we prepend a synthetic "legacy" opening batch (price unknown, so
 * it falls back to displaying the product's cost price) to cover the
 * shortfall — this keeps the sum of batch quantities consistent with the true
 * current stock instead of silently under-reporting it.
 */
export function computeBatches(
  movements: StockBatchMovement[],
  openingStock?: number
): BatchRow[] {
  const sorted = [...movements].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const batches: BatchRow[] = [];
  for (const m of sorted) {
    if (m.type === "in") {
      batches.push({ date: m.created_at, unitPrice: m.unit_price, remaining: m.quantity });
    } else {
      let toDeduct = m.quantity;
      // Price-matched deduction: if the OUT movement carries a unit_price (from a
      // user-selected batch), deduct from that batch first before falling back to FIFO.
      if (m.unit_price != null) {
        const matched = batches.find((b) => b.remaining > 0 && b.unitPrice === m.unit_price);
        if (matched) {
          const d = Math.min(matched.remaining, toDeduct);
          matched.remaining -= d;
          toDeduct -= d;
        }
      }
      // FIFO for any remaining qty (covers fallback and manual stock-out movements)
      for (const b of batches) {
        if (toDeduct <= 0) break;
        const d = Math.min(b.remaining, toDeduct);
        b.remaining -= d;
        toDeduct -= d;
      }
    }
  }

  const result = batches.filter((b) => b.remaining > 0);

  if (openingStock != null) {
    const totalRemaining = result.reduce((a, b) => a + b.remaining, 0);
    const shortfall = openingStock - totalRemaining;
    if (shortfall > 0) {
      result.unshift({
        date: sorted[0]?.created_at ?? new Date(0).toISOString(),
        unitPrice: null,
        remaining: shortfall,
      });
    }
  }

  return result;
}
