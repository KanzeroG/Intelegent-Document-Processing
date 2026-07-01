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
