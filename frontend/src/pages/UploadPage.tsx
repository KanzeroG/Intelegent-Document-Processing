// Upload screen: drag-and-drop + processing settings on top, "My Documents"
// table below. Extraction calls the real backend (/extract) and stores the
// result so the Review and Dashboard screens can use it.

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Preview URL for the staged (not-yet-extracted) file.
  const stagedPreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (stagedPreview) URL.revokeObjectURL(stagedPreview); }, [stagedPreview]);
  const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");

  // Stage a chosen file — does NOT extract. Extraction waits for the button.
  function stageFile(f: File) {
    setFile(f);
  }

  // Run extraction for the staged file when the user clicks "Extract".
  async function runExtract() {
    if (!file) return;
    setLoading(true);
    // A separate object URL is kept on the stored record (survives re-uploads).
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
      setFile(null); // clear the staging area; the doc now lives in the table
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
        {/* Drop zone / staged file */}
        <div className="lg:col-span-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && stageFile(e.target.files[0])}
          />

          {!file ? (
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files?.[0]) stageFile(e.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={[
                "flex h-full min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface-white p-8 text-center transition-colors",
                dragActive ? "border-secondary bg-secondary/5" : "border-outline-variant",
              ].join(" ")}
            >
              <span className="material-symbols-outlined text-5xl text-secondary">cloud_upload</span>
              <p className="mt-3 text-headline-md text-text-primary">
                Drag an invoice, purchase order, or receipt here
              </p>
              <p className="mt-1 text-body-sm text-on-surface-variant">Supports PDF, PNG, or JPG (Max 15MB)</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="rounded-lg bg-primary px-4 py-2 text-body-md font-semibold text-white">Browse files</span>
                <span className="text-body-sm text-on-surface-variant">or drop files here</span>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col rounded-lg border border-border-base bg-surface-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-body-md text-text-primary">
                  <span className="material-symbols-outlined text-secondary">description</span>
                  <span className="font-semibold">{file.name}</span>
                </div>
                <button
                  onClick={() => setFile(null)}
                  disabled={loading}
                  className="text-body-sm text-on-surface-variant hover:text-status-error"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 flex-1 overflow-hidden rounded-lg border border-border-base bg-inverse-surface">
                {stagedPreview && (isPdf ? (
                  <iframe title="staged" src={`${stagedPreview}#view=FitH&toolbar=0&navpanes=0`} className="h-[360px] w-full bg-white" />
                ) : (
                  <img alt="staged" src={stagedPreview} className="max-h-[360px] w-full bg-white object-contain" />
                ))}
              </div>

              <button
                onClick={runExtract}
                disabled={loading}
                className="mt-4 flex h-11 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary-container disabled:opacity-60"
              >
                {loading ? (
                  <>Extracting…</>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">auto_awesome</span>
                    Extract with AI
                  </>
                )}
              </button>
            </div>
          )}
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
