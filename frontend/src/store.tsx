// App-wide state: a stubbed auth/role context and an in-memory store of
// extracted documents. The store lets the Upload flow hand results to the
// Review and Dashboard screens without a backend database (sufficient for the
// vertical slice; persistence comes later).

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ExtractedDocument, Role, ValidationIssue, DocType } from "./api";

// Header fields we expect to be present, by document type. Receipts legitimately
// have no buyer / no separate tax line, so those aren't "missing" for a receipt.
const EXPECTED_FIELDS: Record<DocType, (keyof ExtractedDocument)[]> = {
  invoice: ["doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"],
  purchase_order: ["doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"],
  receipt: ["doc_number", "vendor", "doc_date", "subtotal", "total_amount"],
};

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

// Expected header fields that came back empty for this document type.
export function missingFields(data: ExtractedDocument, docType: DocType): (keyof ExtractedDocument)[] {
  return EXPECTED_FIELDS[docType].filter((f) => isEmpty(data[f]));
}

// ---- Auth (stubbed) ---------------------------------------------------------

interface AuthState {
  role: Role | null;
  signIn: (role: Role) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// ---- Extracted-document store ----------------------------------------------

export type DocStatus =
  | "extracted"
  | "in_review"
  | "approved"
  | "flagged"
  | "rejected";

export interface DocRecord {
  id: string; // doc_number, or a generated id when missing
  fileName: string;
  docType: DocType;
  uploadedAt: string; // YYYY-MM-DD
  status: DocStatus;
  data: ExtractedDocument;
  issues: ValidationIssue[];
  previewUrl: string; // object URL of the uploaded file
  confidence: number; // heuristic 0-100 for display
}

interface DocStore {
  docs: DocRecord[];
  addDoc: (rec: DocRecord) => void;
  updateDoc: (id: string, patch: Partial<DocRecord>) => void;
  getDoc: (id: string) => DocRecord | undefined;
}

const DocContext = createContext<DocStore | null>(null);

export function useDocuments(): DocStore {
  const ctx = useContext(DocContext);
  if (!ctx) throw new Error("useDocuments must be used within DocumentsProvider");
  return ctx;
}

// Derive a display status + confidence from validation issues.
export function statusFromIssues(issues: ValidationIssue[]): DocStatus {
  if (issues.some((i) => i.severity === "error")) return "flagged";
  if (issues.some((i) => i.severity === "warning")) return "in_review";
  return "extracted";
}

// Display confidence heuristic: start at 99, subtract for validation issues AND
// for expected header fields that came back empty. So a doc missing its buyer or
// tax reads lower than a clean one, instead of everything showing 99%.
export function computeConfidence(
  data: ExtractedDocument,
  issues: ValidationIssue[],
  docType: DocType,
): number {
  const issuePenalty = issues.reduce((acc, i) => acc + (i.severity === "error" ? 12 : 4), 0);
  const missingPenalty = missingFields(data, docType).length * 8;
  return Math.max(50, 99 - issuePenalty - missingPenalty);
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [docs, setDocs] = useState<DocRecord[]>([]);

  const auth = useMemo<AuthState>(
    () => ({
      role,
      signIn: setRole,
      signOut: () => setRole(null),
    }),
    [role],
  );

  const store = useMemo<DocStore>(
    () => ({
      docs,
      addDoc: (rec) => setDocs((prev) => [rec, ...prev]),
      updateDoc: (id, patch) =>
        setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d))),
      getDoc: (id) => docs.find((d) => d.id === id),
    }),
    [docs],
  );

  return (
    <AuthContext.Provider value={auth}>
      <DocContext.Provider value={store}>{children}</DocContext.Provider>
    </AuthContext.Provider>
  );
}
