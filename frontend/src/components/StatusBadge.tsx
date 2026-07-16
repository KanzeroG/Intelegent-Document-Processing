// Pill-shaped status badge: light tint background + high-contrast status text.
import type { DocStatus } from "../store";

const STYLES: Record<DocStatus, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-status-success/10 text-status-success" },
  extracted: { label: "To Review", cls: "bg-secondary/10 text-secondary" },
  in_review: { label: "Warning", cls: "bg-[#EAB308]/10 text-[#EAB308]" },
  flagged: { label: "Error", cls: "bg-status-error/10 text-status-error" },
  rejected: { label: "Rejected", cls: "bg-status-neutral/10 text-status-neutral" },
};

export default function StatusBadge({ status }: { status: DocStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-label-sm ${s.cls}`}>
      {s.label}
    </span>
  );
}