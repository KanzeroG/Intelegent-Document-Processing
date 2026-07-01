// App-wide state: a stubbed auth/role context and an API-backed store of
// extracted documents. Documents are persisted server-side (SQLite); this store
// loads them on mount and keeps a local copy in sync as records are added or
// edited, so a page refresh no longer loses work or re-runs the model.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  listDocuments,
  fileUrl,
  type DocumentRecord,
  type ExtractedDocument,
  type Role,
  type DocStatus,
  type DocType,
} from "./api";

export type { DocStatus } from "./api";

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

// ---- Document store (API-backed) -------------------------------------------

// Client-side view of a persisted document. Field names match what the pages
// already use; `previewUrl` points at the backend's stored-file endpoint.
export interface DocRecord {
  id: string;
  doc_number: string | null;
  fileName: string;
  docType: DocType;
  uploadedAt: string;
  status: DocStatus;
  data: ExtractedDocument;
  issues: DocumentRecord["issues"];
  previewUrl: string;
  confidence: number;
}

export function toRecord(r: DocumentRecord): DocRecord {
  return {
    id: r.id,
    doc_number: r.doc_number,
    fileName: r.filename ?? "document",
    docType: r.doc_type,
    uploadedAt: r.uploaded_at,
    status: r.status,
    data: r.data,
    issues: r.issues,
    previewUrl: fileUrl(r.id),
    confidence: r.confidence,
  };
}

interface DocStore {
  docs: DocRecord[];
  loading: boolean;
  reload: () => Promise<void>;
  addRecord: (r: DocumentRecord) => void;
  replaceRecord: (r: DocumentRecord) => void;
  getDoc: (id: string) => DocRecord | undefined;
}

const DocContext = createContext<DocStore | null>(null);

export function useDocuments(): DocStore {
  const ctx = useContext(DocContext);
  if (!ctx) throw new Error("useDocuments must be used within DocumentsProvider");
  return ctx;
}

// Expected header fields per doc type (receipts have no buyer / tax line).
// Kept client-side to drive the "Missing" badges + confidence display.
const EXPECTED_FIELDS: Record<DocType, (keyof ExtractedDocument)[]> = {
  invoice: ["doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"],
  purchase_order: ["doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"],
  receipt: ["doc_number", "vendor", "doc_date", "subtotal", "total_amount"],
};

export function missingFields(data: ExtractedDocument, docType: DocType): (keyof ExtractedDocument)[] {
  return EXPECTED_FIELDS[docType].filter((f) => {
    const v = data[f];
    return v === null || v === undefined || v === "";
  });
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setDocs((await listDocuments()).map(toRecord));
    } catch {
      /* backend not up yet — leave docs as-is */
    } finally {
      setLoading(false);
    }
  }

  // Load persisted documents once on mount.
  useEffect(() => {
    void reload();
  }, []);

  const auth = useMemo<AuthState>(
    () => ({ role, signIn: setRole, signOut: () => setRole(null) }),
    [role],
  );

  const store = useMemo<DocStore>(
    () => ({
      docs,
      loading,
      reload,
      addRecord: (r) => setDocs((prev) => [toRecord(r), ...prev]),
      replaceRecord: (r) =>
        setDocs((prev) => prev.map((d) => (d.id === r.id ? toRecord(r) : d))),
      getDoc: (id) => docs.find((d) => d.id === id),
    }),
    [docs, loading],
  );

  return (
    <AuthContext.Provider value={auth}>
      <DocContext.Provider value={store}>{children}</DocContext.Provider>
    </AuthContext.Provider>
  );
}
