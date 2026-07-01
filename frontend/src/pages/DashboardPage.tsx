// Monitoring dashboard. Metric cards and the activity table are derived from
// the real in-memory document store; the trend chart is illustrative. Mirrors
// the DocExtract design (deliverables #5/#6 surface here later).

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth, useDocuments } from "../store";
import StatusBadge from "../components/StatusBadge";
import { runEval, getEvalStatus, type EvalStatus } from "../api";
import { formatIDR, DOC_TYPE_LABEL } from "../lib/format";

export default function DashboardPage() {
  const { docs } = useDocuments();
  const { role } = useAuth();

  // Accuracy evaluation (admin): load last summary, poll while a run is active.
  const [evalStatus, setEvalStatus] = useState<EvalStatus | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await getEvalStatus();
        if (!alive) return;
        setEvalStatus(s);
        if (s.running && pollRef.current === null) {
          pollRef.current = window.setInterval(tick, 3000);
        } else if (!s.running && pollRef.current !== null) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        /* backend down — ignore */
      }
    };
    void tick();
    return () => {
      alive = false;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  async function handleRunEval(limit?: number) {
    try {
      await runEval(role ?? "user", limit);
      toast.success("Evaluation started — this runs in the background.");
      const s = await getEvalStatus();
      setEvalStatus(s);
      if (s.running && pollRef.current === null) {
        pollRef.current = window.setInterval(async () => {
          const st = await getEvalStatus();
          setEvalStatus(st);
          if (!st.running && pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 3000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start evaluation");
    }
  }

  const evalSummary = evalStatus?.summary ?? null;

  const total = docs.length;
  const pending = docs.filter((d) => d.status === "in_review" || d.status === "flagged").length;
  const approved = docs.filter((d) => d.status === "approved").length;
  const flagged = docs.filter((d) => d.status === "flagged").length;
  const accuracy = total ? Math.round(docs.reduce((a, d) => a + d.confidence, 0) / total) : 0;

  const byType = (["invoice", "purchase_order", "receipt"] as const).map((t) => ({
    type: t,
    count: docs.filter((d) => d.docType === t).length,
  }));
  const maxType = Math.max(1, ...byType.map((b) => b.count));

  // Count validation issues by rule (field) across all docs.
  const ruleCounts: Record<string, number> = {};
  docs.forEach((d) => d.issues.forEach((i) => {
    const key = i.field.split("[")[0];
    ruleCounts[key] = (ruleCounts[key] ?? 0) + 1;
  }));
  const topRules = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // Fraction of documents that need human review, driven by the real eval
  // (docs not fully correct) when available; otherwise a conservative default.
  const roiNeedsReview =
    evalSummary && evalSummary.n
      ? (evalSummary.n - evalSummary.docs_fully_correct) / evalSummary.n
      : 0.2;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-headline-lg text-text-primary">Monitoring Dashboard</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        System performance, accuracy metrics, and automation ROI (this session).
      </p>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <Metric icon="description" label="Total Documents" value={total} tint="text-secondary" />
        <Metric icon="pending_actions" label="Pending Review" value={pending} tint="text-status-warning" />
        <Metric icon="task_alt" label="Approved" value={approved} tint="text-status-success" />
        <Metric icon="flag" label="Flagged Issues" value={flagged} tint="text-status-error" />
      </div>

      {/* Model accuracy vs ground truth (evaluation) */}
      <div className="mt-gutter rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-headline-md text-text-primary">Model Accuracy (vs ground truth)</h3>
            <p className="text-body-sm text-on-surface-variant">
              Field-level accuracy over the labelled sample documents.
            </p>
          </div>
          {role === "admin" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRunEval(10)}
                disabled={evalStatus?.running}
                className="rounded-lg border border-border-base px-3 py-2 text-body-sm font-semibold text-text-primary disabled:opacity-50"
              >
                Sample (10)
              </button>
              <button
                onClick={() => handleRunEval()}
                disabled={evalStatus?.running}
                className="rounded-lg bg-primary px-3 py-2 text-body-sm font-semibold text-white hover:bg-primary-container disabled:opacity-50"
              >
                Run full (60)
              </button>
            </div>
          )}
        </div>

        {evalStatus?.running && (
          <div className="mt-4">
            <div className="flex justify-between text-body-sm text-on-surface-variant">
              <span>Evaluating…</span>
              <span className="mono">{evalStatus.done}/{evalStatus.total}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-surface-container">
              <div
                className="h-2 rounded-full bg-secondary transition-all"
                style={{ width: `${evalStatus.total ? (evalStatus.done / evalStatus.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {evalStatus?.error && (
          <p className="mt-3 text-body-sm text-status-error">Last run failed: {evalStatus.error}</p>
        )}

        {evalSummary ? (
          <div className="mt-4 grid grid-cols-1 gap-gutter md:grid-cols-3">
            <div>
              <div className="flex items-end gap-2">
                <span className="text-display text-text-primary">{evalSummary.overall}%</span>
                <span className="mb-2 text-body-sm text-on-surface-variant">overall</span>
              </div>
              <p className="text-body-sm text-on-surface-variant">
                {evalSummary.docs_fully_correct}/{evalSummary.n} docs fully correct · {evalSummary.ran_at}
              </p>
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-label-sm uppercase text-on-surface-variant">By document type</div>
              <div className="space-y-2">
                {Object.entries(evalSummary.by_type).map(([t, v]) => (
                  <div key={t}>
                    <div className="flex justify-between text-body-sm text-on-surface-variant">
                      <span>{DOC_TYPE_LABEL[t] ?? t}</span>
                      <span className="mono">{v.accuracy}% ({v.docs} docs)</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-container">
                      <div
                        className="h-2 rounded-full bg-status-success"
                        style={{ width: `${v.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          !evalStatus?.running && (
            <p className="mt-4 text-body-sm text-on-surface-variant">
              No evaluation yet.{" "}
              {role === "admin" ? "Click “Run full (60)” to score the sample docs." : "Ask an admin to run it."}
            </p>
          )
        )}
      </div>

      <div className="mt-gutter grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {/* Docs by type */}
        <Card title="Docs by Type">
          <div className="space-y-3">
            {byType.map((b) => (
              <div key={b.type}>
                <div className="flex justify-between text-body-sm text-on-surface-variant">
                  <span>{DOC_TYPE_LABEL[b.type]}</span>
                  <span className="mono">{b.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-container">
                  <div className="h-2 rounded-full bg-secondary" style={{ width: `${(b.count / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Accuracy — real eval overall if available, else session confidence */}
        <Card title="Accuracy Score">
          <div className="flex items-end gap-2">
            <span className="text-display text-text-primary">{evalSummary ? evalSummary.overall : accuracy}%</span>
            <span className="mb-2 text-body-sm text-on-surface-variant">
              {evalSummary ? "vs ground truth" : "avg confidence"}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-surface-container">
            <div
              className="h-2 rounded-full bg-status-success"
              style={{ width: `${evalSummary ? evalSummary.overall : accuracy}%` }}
            />
          </div>
        </Card>

        <Card title="Issues by Rule">
          {topRules.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No issues recorded.</p>
          ) : (
            <ul className="space-y-2 text-body-sm">
              {topRules.map(([rule, n]) => (
                <li key={rule} className="flex justify-between">
                  <span className="text-on-surface-variant">{rule}</span>
                  <span className="mono font-semibold text-status-error">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Cost-benefit / ROI calculator (deliverable #6) */}
      <div className="mt-gutter">
        <ROICard needsReviewFraction={roiNeedsReview} />
      </div>

      {/* Recent activity */}
      <div className="mt-gutter">
          <Card title="Recent Activity">
            {docs.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">No activity yet.</p>
            ) : (
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="text-label-sm uppercase text-on-surface-variant">
                    <th className="py-2">Doc ID</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.slice(0, 6).map((d, i) => (
                    <tr key={d.id + i} className="border-t border-border-base">
                      <td className="py-2 font-semibold text-secondary mono">
                        <Link to={`/review/${encodeURIComponent(d.id)}`}>{d.id}</Link>
                      </td>
                      <td className="py-2 text-on-surface-variant">{DOC_TYPE_LABEL[d.docType]}</td>
                      <td className="py-2"><StatusBadge status={d.status} /></td>
                      <td className="py-2 text-right mono">{formatIDR(d.data.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
    </div>
  );
}

function Metric({ icon, label, value, tint }: { icon: string; label: string; value: number; tint: string }) {
  return (
    <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
      <span className={`material-symbols-outlined ${tint}`}>{icon}</span>
      <div className="mt-2 text-display text-text-primary">{value}</div>
      <div className="text-body-sm text-on-surface-variant">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
      <h3 className="text-headline-md text-text-primary">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// Cost-benefit / ROI calculator (deliverable #6). Editable assumptions; the
// "needs review" fraction is driven by the real evaluation when available.
function ROICard({ needsReviewFraction }: { needsReviewFraction: number }) {
  const [volume, setVolume] = useState(1000); // docs / month
  const [manualMin, setManualMin] = useState(6); // minutes to key one doc manually
  const [rate, setRate] = useState(50000); // reviewer cost, IDR / hour
  const [reviewMin, setReviewMin] = useState(3); // minutes to review one flagged doc
  const [implCost, setImplCost] = useState(15000000); // one-time setup, IDR

  const manualCost = volume * (manualMin / 60) * rate;
  const reviewedDocs = volume * needsReviewFraction;
  const autoCost = reviewedDocs * (reviewMin / 60) * rate; // only flagged docs need a human
  const savings = manualCost - autoCost;
  const savingsPct = manualCost > 0 ? (savings / manualCost) * 100 : 0;
  const paybackMonths = savings > 0 ? implCost / savings : Infinity;
  const max = Math.max(manualCost, autoCost, 1);

  const Row = ({ label, amount, cls }: { label: string; amount: number; cls: string }) => (
    <div className="mb-3">
      <div className="flex justify-between text-body-sm text-on-surface-variant">
        <span>{label}</span>
        <span className="mono">{formatIDR(amount)}/mo</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-surface-container">
        <div className={`h-2 rounded-full ${cls}`} style={{ width: `${Math.min(100, (amount / max) * 100)}%` }} />
      </div>
    </div>
  );

  const Input = ({ label, value, set, step = 1 }: { label: string; value: number; set: (n: number) => void; step?: number }) => (
    <label className="block">
      <span className="text-label-md text-on-surface-variant">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => set(Number(e.target.value) || 0)}
        className="mt-1 h-9 w-full rounded-lg border border-border-base px-2 text-body-sm mono"
      />
    </label>
  );

  return (
    <Card title="Cost-Benefit vs. Manual Entry (ROI)">
      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
        {/* Assumptions */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Volume (docs/month)" value={volume} set={setVolume} step={100} />
          <Input label="Manual min/doc" value={manualMin} set={setManualMin} />
          <Input label="Reviewer rate (IDR/hr)" value={rate} set={setRate} step={5000} />
          <Input label="Review min/flagged doc" value={reviewMin} set={setReviewMin} />
          <Input label="One-time setup (IDR)" value={implCost} set={setImplCost} step={1000000} />
          <label className="block">
            <span className="text-label-md text-on-surface-variant">Docs needing review</span>
            <div className="mt-1 flex h-9 items-center rounded-lg border border-border-base px-2 text-body-sm mono text-text-primary">
              {(needsReviewFraction * 100).toFixed(0)}%
            </div>
          </label>
        </div>

        {/* Results */}
        <div>
          <Row label="Manual processing" amount={manualCost} cls="bg-status-error" />
          <Row label="Automated (review only)" amount={autoCost} cls="bg-status-success" />
          <div className="mt-3 rounded-lg bg-status-success/5 p-3">
            <div className="text-body-sm text-on-surface-variant">Estimated savings</div>
            <div className="text-headline-md font-semibold text-status-success mono">
              {formatIDR(savings)}/mo · {formatIDR(savings * 12)}/yr
            </div>
            <div className="mt-1 text-body-sm text-on-surface-variant">
              {savingsPct.toFixed(0)}% lower cost · payback in{" "}
              {Number.isFinite(paybackMonths) ? `${paybackMonths.toFixed(1)} months` : "—"}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
