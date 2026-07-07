// Client-side mirror of backend/app/validation.py (rules 1-8) so the review
// screen can show hints that appear/clear AS the reviewer types — exactly what
// the backend will recompute when the correction is saved. Field names,
// tolerances, and messages must stay in lockstep with validation.py.
// (Rule 9, the per-field-confidence hook, is skipped: extraction never emits
// confidences yet, so the backend never fires it either.)

import type { ExtractedDocument } from "../api";

export interface LiveIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

const RECONCILE_TOLERANCE = 1; // Rupiah — covers rounding
const PPN_RATE = 0.11;
const PPN_TOLERANCE = 0.005; // ±0.5 percentage points

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export function validateLive(doc: ExtractedDocument): LiveIssue[] {
  const issues: LiveIssue[] = [];
  const err = (field: string, message: string) =>
    issues.push({ field, severity: "error", message });
  const warn = (field: string, message: string) =>
    issues.push({ field, severity: "warning", message });

  // 1. Required fields.
  for (const field of ["vendor", "total_amount"] as const) {
    const v = doc[field];
    if (v === null || v === undefined || v === "") {
      err(field, `Required field '${field}' is missing.`);
    }
  }

  // 2. Line items sum to subtotal (a missing/extra line is plausible -> warning).
  const lineTotals = doc.line_items
    .map((li) => li.line_total)
    .filter((v): v is number => v !== null);
  if (lineTotals.length > 0 && doc.subtotal !== null) {
    const summed = lineTotals.reduce((a, b) => a + b, 0);
    if (Math.abs(summed - doc.subtotal) > RECONCILE_TOLERANCE) {
      warn("line_items", `Line items sum to ${summed}, which does not match subtotal ${doc.subtotal}.`);
    }
  }

  // 3. subtotal + tax == total — an arithmetic contradiction is an error.
  if (doc.subtotal !== null && doc.total_amount !== null) {
    const tax = doc.tax_amount ?? 0;
    if (Math.abs(doc.subtotal + tax - doc.total_amount) > RECONCILE_TOLERANCE) {
      err(
        "total_amount",
        `subtotal (${doc.subtotal}) + tax (${tax}) = ${doc.subtotal + tax}, but total_amount is ${doc.total_amount}.`,
      );
    }
  }

  // 4. PPN 11% expectation by document type.
  if (doc.doc_type === "invoice" || doc.doc_type === "purchase_order") {
    if (doc.subtotal !== null && doc.tax_amount !== null && doc.subtotal > 0) {
      const rate = doc.tax_amount / doc.subtotal;
      if (Math.abs(rate - PPN_RATE) > PPN_TOLERANCE) {
        warn("tax_amount", `Tax is ${(rate * 100).toFixed(1)}% of subtotal; expected PPN 11%.`);
      }
    }
  } else if (doc.doc_type === "receipt" && doc.tax_amount) {
    warn("tax_amount", "Receipts should not have a separate tax line.");
  }

  // 5. Date format: a real calendar date in YYYY-MM-DD. (Empty is handled by
  // the missing-field badges; the form normalizes "" to null before saving.)
  if (doc.doc_date !== null && doc.doc_date !== "") {
    if (!DATE_RE.test(doc.doc_date)) {
      warn("doc_date", `Date '${doc.doc_date}' is not in YYYY-MM-DD format.`);
    } else {
      const [y, m, d] = doc.doc_date.split("-").map(Number);
      const parsed = new Date(y, m - 1, d);
      if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
        warn("doc_date", `Date '${doc.doc_date}' is not a valid calendar date.`);
      }
    }
  }

  // 6. Currency: 3-letter ISO-style code.
  if (doc.currency && !CURRENCY_RE.test(doc.currency)) {
    warn("currency", `Currency '${doc.currency}' is not a 3-letter code (e.g. IDR).`);
  }

  // 7. doc_number should always be printed on these documents.
  if (doc.doc_number === null || doc.doc_number === "") {
    warn("doc_number", "Document number is missing; it is normally printed near the top.");
  }

  // 8. Per-line arithmetic: qty * unit_price should equal line_total.
  doc.line_items.forEach((li, idx) => {
    if (li.qty !== null && li.unit_price !== null && li.line_total !== null) {
      const expected = Math.round(li.qty * li.unit_price);
      if (Math.abs(expected - li.line_total) > RECONCILE_TOLERANCE) {
        warn(
          `line_items[${idx}].line_total`,
          `'${li.description}': qty (${li.qty}) x unit_price (${li.unit_price}) = ${expected}, but line_total is ${li.line_total}.`,
        );
      }
    }
  });

  return issues;
}
