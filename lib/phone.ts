// Pakistani phone normalization utilities

/**
 * Normalize a Pakistani mobile number to canonical 11-digit format (e.g. "03001234567").
 * Returns null if the input cannot be recognized.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-().+]/g, "");
  if (digits.startsWith("92") && digits.length === 12) return "0" + digits.slice(2);
  if (digits.startsWith("03") && digits.length === 11) return digits;
  return null;
}

/** Convert canonical phone to international format for WhatsApp API (no + prefix). */
export function toIntlNoPlus(canonical: string): string {
  return "92" + canonical.slice(1);
}

/** Format canonical phone for display: "03001234567" → "0300-1234567" */
export function displayPhone(canonical: string): string {
  return canonical.slice(0, 4) + "-" + canonical.slice(4);
}

/** Generate a stable synthetic email from phone for auth. Never show to users. */
export function syntheticEmailFromPhone(canonical: string): string {
  return "staff-" + canonical + "@dms.staff.local";
}
