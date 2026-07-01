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

// Indicative manual-entry cost per document (IDR) for the ROI comparison.
const MANUAL_COST_PER_DOC = 18000;
const AUTO_COST_PER_DOC = 1200;

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

  const manualCost = total * MANUAL_COST_PER_DOC;
  const autoCost = total * AUTO_COST_PER_DOC;

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

      {/* Efficiency impact + recent activity */}
      <div className="mt-gutter grid grid-cols-1 gap-gutter lg:grid-cols-3">
        <Card title="Efficiency Impact (this session)">
          <CostRow label="Manual processing cost" value={manualCost} cls="bg-status-error" max={manualCost || 1} amount={manualCost} />
          <CostRow label="Automated cost" value={autoCost} cls="bg-status-success" max={manualCost || 1} amount={autoCost} />
          <div className="mt-3 rounded-lg bg-status-success/5 p-3 text-body-sm text-status-success">
            Estimated savings: <span className="font-semibold mono">{formatIDR(manualCost - autoCost)}</span>
          </div>
        </Card>

        <div className="lg:col-span-2">
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

function CostRow({ label, cls, max, amount }: { label: string; value: number; cls: string; max: number; amount: number }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-body-sm text-on-surface-variant">
        <span>{label}</span>
        <span className="mono">{formatIDR(amount)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-surface-container">
        <div className={`h-2 rounded-full ${cls}`} style={{ width: `${Math.min(100, (amount / max) * 100)}%` }} />
      </div>
    </div>
  );
}
