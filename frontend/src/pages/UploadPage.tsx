// Upload screen: drag-and-drop + processing settings on top, "My Documents"
// table below. Extraction calls the real backend (/extract) and stores the
// result so the Review and Dashboard screens can use it.

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { extractDocument, type DocType } from "../api";
import {
  useAuth,
  useDocuments,
  statusFromIssues,
  computeConfidence,
  type DocRecord,
} from "../store";
import StatusBadge from "../components/StatusBadge";
import { DOC_TYPE_LABEL } from "../lib/format";

const TYPES: DocType[] = ["invoice", "purchase_order", "receipt"];

export default function UploadPage() {
  const { role } = useAuth();
  const { docs, addDoc } = useDocuments();
  const navigate = useNavigate();

  const [docType, setDocType] = useState<DocType>("invoice");
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setLoading(true);
    const previewUrl = URL.createObjectURL(file);
    try {
      const res = await toast.promise(extractDocument(file, docType, role ?? "user"), {
        loading: "Extracting with the vision model…",
        success: "Extraction complete",
        error: (e) => (e instanceof Error ? e.message : "Extraction failed"),
      });
      const rec: DocRecord = {
        id: res.data.doc_number || `DOC-${Date.now().toString().slice(-6)}`,
        fileName: file.name,
        docType: res.doc_type,
        uploadedAt: new Date().toISOString().slice(0, 10),
        status: statusFromIssues(res.issues),
        data: res.data,
        issues: res.issues,
        previewUrl,
        confidence: computeConfidence(res.data, res.issues, res.doc_type),
      };
      addDoc(rec);
    } catch {
      URL.revokeObjectURL(previewUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-headline-lg text-text-primary">Upload Documents</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Intelligently process your financial documents using Indonesian-optimized AI.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {/* Drop zone */}
        <div className="lg:col-span-2">
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={[
              "flex h-full min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface-white p-8 text-center transition-colors",
              dragActive ? "border-secondary bg-secondary/5" : "border-outline-variant",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <span className="material-symbols-outlined text-5xl text-secondary">cloud_upload</span>
            <p className="mt-3 text-headline-md text-text-primary">
              Drag an invoice, purchase order, or receipt here
            </p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Supports PDF, PNG, or JPG (Max 15MB)
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="rounded-lg bg-primary px-4 py-2 text-body-md font-semibold text-white">
                {loading ? "Processing…" : "Browse files"}
              </span>
              <span className="text-body-sm text-on-surface-variant">or drop files here</span>
            </div>
          </div>
        </div>

        {/* Processing settings */}
        <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
          <h3 className="text-headline-md text-text-primary">Processing Settings</h3>

          <label className="mt-4 block">
            <span className="text-label-md text-on-surface-variant">Document Type</span>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocType)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border-base bg-surface-white px-3 text-body-md"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="text-label-md text-on-surface-variant">Extraction Language</span>
            <div className="mt-1.5 flex h-10 items-center gap-2 rounded-lg border border-border-base px-3 text-body-md text-text-primary">
              <span className="material-symbols-outlined text-base text-on-surface-variant">language</span>
              Bahasa Indonesia / English
            </div>
          </label>

          <label className="mt-4 flex items-start gap-2 text-body-sm text-text-primary">
            <input type="checkbox" defaultChecked className="mt-0.5" />
            Auto-validate common Indonesian VAT (PPN)
          </label>

          <div className="mt-4 flex gap-2 rounded-lg bg-secondary/5 p-3 text-body-sm text-secondary">
            <span className="material-symbols-outlined text-base">info</span>
            Documents are processed locally with a vision model optimized for PT/CV entities.
          </div>
        </div>
      </div>

      {/* My Documents */}
      <div className="mt-8 rounded-lg border border-border-base bg-surface-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border-base px-5 py-4">
          <h3 className="text-headline-md text-text-primary">My Documents</h3>
          <span className="text-body-sm text-on-surface-variant">{docs.length} document(s)</span>
        </div>

        {docs.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            No documents yet — upload one above to get started.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-label-sm uppercase text-on-surface-variant">
                <th className="px-5 py-3">Doc ID</th>
                <th className="px-5 py-3">File Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Uploaded</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-body-md">
              {docs.map((d, i) => (
                <tr key={d.id + i} className={i % 2 ? "bg-surface-container-low/40" : ""}>
                  <td className="px-5 py-3 font-semibold text-secondary mono">{d.id}</td>
                  <td className="px-5 py-3 text-text-primary">{d.fileName}</td>
                  <td className="px-5 py-3 text-on-surface-variant">{DOC_TYPE_LABEL[d.docType]}</td>
                  <td className="px-5 py-3 text-on-surface-variant">{d.uploadedAt}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => navigate(`/review/${encodeURIComponent(d.id)}`)}
                      className="font-semibold text-secondary hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
