// Indonesian Rupiah formatting: dot thousands separators, no decimals.
export function formatIDR(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return "Rp " + value.toLocaleString("id-ID");
}

// Plain grouped number (no currency prefix) for table cells.
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("id-ID");
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  receipt: "Receipt",
};

// Human-readable date(-time). Accepts the backend's two shapes — date-only
// "YYYY-MM-DD" (uploaded_at) and "YYYY-MM-DD HH:MM:SS" (eval ran_at) — and
// falls back to the raw string for anything unparseable.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const hasTime = value.includes(":");
  const d = new Date(hasTime ? value.replace(" ", "T") : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  const datePart = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  if (!hasTime) return datePart;
  const timePart = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

// THE document identifier, used consistently across Upload / Review /
// Dashboard / Chat: the extracted doc_number, else a short prefix of the id.
export function docLabel(d: { doc_number: string | null; id: string }): string {
  return d.doc_number ?? d.id.slice(0, 8);
}
