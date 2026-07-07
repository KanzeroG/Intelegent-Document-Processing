import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDocuments } from "../store";
import { docLabel, formatDateTime, DOC_TYPE_LABEL } from "../lib/format";
import StatusBadge from "../components/StatusBadge";

export default function PerformancePage() {
  const { docs, loading, reload } = useDocuments();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [speedFilter, setSpeedFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  // Filter docs that have a valid processing time
  const timedDocs = useMemo(() => {
    return docs.filter(
      (d) => d.processingTime !== null && d.processingTime !== undefined
    );
  }, [docs]);

  // Calculations for metric cards
  const stats = useMemo(() => {
    if (timedDocs.length === 0) {
      return {
        avg: "—",
        fastest: "—",
        slowest: "—",
        count: 0,
      };
    }
    const times = timedDocs.map((d) => d.processingTime as number);
    const sum = times.reduce((a, b) => a + b, 0);
    return {
      avg: (sum / times.length).toFixed(2),
      fastest: Math.min(...times).toFixed(2),
      slowest: Math.max(...times).toFixed(2),
      count: times.length,
    };
  }, [timedDocs]);

  // Breakdown by doc type
  const typeBreakdown = useMemo(() => {
    const types = ["invoice", "purchase_order", "receipt"] as const;
    return types.map((t) => {
      const typeDocs = timedDocs.filter((d) => d.docType === t);
      const avg = typeDocs.length
        ? (
            typeDocs.reduce((sum, d) => sum + (d.processingTime || 0), 0) /
            typeDocs.length
          ).toFixed(2)
        : "—";
      return {
        type: t,
        avg: avg,
        count: typeDocs.length,
      };
    });
  }, [timedDocs]);

  // Filtered list for the table
  const filteredDocs = useMemo(() => {
    return docs.filter((d) => {
      // 1. Search filter
      const matchesSearch =
        d.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.doc_number &&
          d.doc_number.toLowerCase().includes(searchTerm.toLowerCase()));

      // 2. Type filter
      const matchesType = typeFilter === "all" || d.docType === typeFilter;

      // 3. Speed filter
      let matchesSpeed = true;
      if (speedFilter !== "all") {
        if (d.processingTime === null || d.processingTime === undefined) {
          matchesSpeed = false;
        } else if (speedFilter === "fast") {
          matchesSpeed = d.processingTime < 5;
        } else if (speedFilter === "normal") {
          matchesSpeed = d.processingTime >= 5 && d.processingTime <= 15;
        } else if (speedFilter === "slow") {
          matchesSpeed = d.processingTime > 15;
        }
      }

      return matchesSearch && matchesType && matchesSpeed;
    });
  }, [docs, searchTerm, typeFilter, speedFilter]);

  // Helper to color-code processing time badges
  const getSpeedLabel = (time: number | null) => {
    if (time === null) return { label: "N/A", cls: "bg-status-neutral/10 text-status-neutral" };
    if (time < 5) return { label: "Fast (<5s)", cls: "bg-status-success/15 text-status-success" };
    if (time <= 15) return { label: "Normal (5-15s)", cls: "bg-status-warning/15 text-status-warning" };
    return { label: "Slow (>15s)", cls: "bg-status-error/15 text-status-error" };
  };

  const maxAvgTypeSpeed = useMemo(() => {
    const speeds = typeBreakdown
      .map((b) => parseFloat(b.avg))
      .filter((s) => !isNaN(s));
    return speeds.length ? Math.max(...speeds, 10) : 15;
  }, [typeBreakdown]);

  return (
    <div className="mx-auto max-w-6xl space-y-gutter">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg text-text-primary">Model Performance</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Analyze the latency and processing speed of the document extraction vision model.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || refreshing}
          className="flex items-center gap-1 rounded-lg border border-border-base bg-surface-white px-3 py-2 text-body-sm font-semibold text-text-primary hover:bg-surface-container-low transition-colors disabled:opacity-50"
        >
          <span
            className={`material-symbols-outlined text-base ${
              loading || refreshing ? "animate-spin" : ""
            }`}
          >
            refresh
          </span>
          Refresh
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        {/* Card 1: Average Latency */}
        <div className="relative overflow-hidden rounded-xl border border-border-base bg-surface-white p-5 shadow-sm hover:shadow-md transition-all group duration-200">
          <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 bg-secondary/5 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
          <span className="material-symbols-outlined text-secondary text-2xl">avg_time</span>
          <div className="mt-3 text-display text-text-primary font-bold">
            {stats.avg !== "—" ? `${stats.avg}s` : "—"}
          </div>
          <div className="text-body-sm text-on-surface-variant font-semibold">Average Speed</div>
          <div className="mt-1 text-[11px] text-on-surface-variant/80">Average latency across all tracked extractions</div>
        </div>

        {/* Card 2: Fastest Extraction */}
        <div className="relative overflow-hidden rounded-xl border border-border-base bg-surface-white p-5 shadow-sm hover:shadow-md transition-all group duration-200">
          <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 bg-status-success/5 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
          <span className="material-symbols-outlined text-status-success text-2xl">bolt</span>
          <div className="mt-3 text-display text-text-primary font-bold">
            {stats.fastest !== "—" ? `${stats.fastest}s` : "—"}
          </div>
          <div className="text-body-sm text-on-surface-variant font-semibold">Fastest Run</div>
          <div className="mt-1 text-[11px] text-on-surface-variant/80">Minimum time recorded during extraction</div>
        </div>

        {/* Card 3: Slowest Extraction */}
        <div className="relative overflow-hidden rounded-xl border border-border-base bg-surface-white p-5 shadow-sm hover:shadow-md transition-all group duration-200">
          <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 bg-status-error/5 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
          <span className="material-symbols-outlined text-status-error text-2xl">release_alert</span>
          <div className="mt-3 text-display text-text-primary font-bold">
            {stats.slowest !== "—" ? `${stats.slowest}s` : "—"}
          </div>
          <div className="text-body-sm text-on-surface-variant font-semibold">Slowest Run</div>
          <div className="mt-1 text-[11px] text-on-surface-variant/80">Maximum time recorded (check network/context)</div>
        </div>

        {/* Card 4: Total Tracked */}
        <div className="relative overflow-hidden rounded-xl border border-border-base bg-surface-white p-5 shadow-sm hover:shadow-md transition-all group duration-200">
          <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 bg-status-neutral/5 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
          <span className="material-symbols-outlined text-status-neutral text-2xl">tag</span>
          <div className="mt-3 text-display text-text-primary font-bold">{stats.count}</div>
          <div className="text-body-sm text-on-surface-variant font-semibold">Tracked Extractions</div>
          <div className="mt-1 text-[11px] text-on-surface-variant/80">Documents processed with duration data</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {/* Breakdown by Type */}
        <div className="rounded-xl border border-border-base bg-surface-white p-5 shadow-sm lg:col-span-1">
          <h3 className="text-headline-md text-text-primary">Breakdown by Doc Type</h3>
          <p className="text-body-sm text-on-surface-variant mb-4">
            Average extraction speeds compared by document layout.
          </p>

          <div className="space-y-4 mt-6">
            {typeBreakdown.map((item) => {
              const parsedAvg = parseFloat(item.avg);
              const barWidth = isNaN(parsedAvg)
                ? 0
                : Math.max(8, Math.min(100, (parsedAvg / maxAvgTypeSpeed) * 100));

              return (
                <div key={item.type} className="group">
                  <div className="flex justify-between items-center text-body-sm mb-1.5">
                    <span className="font-semibold text-text-primary">
                      {DOC_TYPE_LABEL[item.type]}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-on-surface-variant text-xs">
                        ({item.count} docs)
                      </span>
                      <span className="mono text-secondary font-bold">
                        {item.avg !== "—" ? `${item.avg}s` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        item.type === "invoice"
                          ? "bg-secondary-container"
                          : item.type === "purchase_order"
                          ? "bg-primary-container"
                          : "bg-tertiary-container"
                      }`}
                      style={{ width: `${barWidth}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-lg bg-surface-container-low p-4 text-body-sm text-on-surface-variant border border-border-base/50">
            <h4 className="font-semibold text-text-primary flex items-center gap-1.5 mb-1.5">
              <span className="material-symbols-outlined text-base text-secondary">info</span>
              Model Performance Info
            </h4>
            <p className="text-[12px] leading-relaxed">
              Receipts are generally smaller and require less context, resulting in faster processing. Invoices and Purchase Orders contain multiple line items that increase prompt length and extraction latency.
            </p>
          </div>
        </div>

        {/* Detailed Logs and Filters */}
        <div className="rounded-xl border border-border-base bg-surface-white p-5 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-headline-md text-text-primary">Processing Log</h3>
              <p className="text-body-sm text-on-surface-variant">
                History of all documents with model latency stats.
              </p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-surface-container-low p-3 rounded-lg border border-border-base/60">
            {/* Search Input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 text-lg">
                search
              </span>
              <input
                type="text"
                placeholder="Search filename..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-base bg-surface-white text-body-sm"
              />
            </div>

            {/* Type Dropdown */}
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-border-base bg-surface-white text-body-sm"
              >
                <option value="all">All Document Types</option>
                <option value="invoice">Invoices</option>
                <option value="purchase_order">Purchase Orders</option>
                <option value="receipt">Receipts</option>
              </select>
            </div>

            {/* Speed Range Filter */}
            <div>
              <select
                value={speedFilter}
                onChange={(e) => setSpeedFilter(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-border-base bg-surface-white text-body-sm"
              >
                <option value="all">All Latency Classes</option>
                <option value="fast">Fast ( &lt; 5s )</option>
                <option value="normal">Normal ( 5s - 15s )</option>
                <option value="slow">Slow ( &gt; 15s )</option>
              </select>
            </div>
          </div>

          {/* Table list */}
          <div className="overflow-x-auto">
            {filteredDocs.length === 0 ? (
              <div className="py-12 text-center text-body-md text-on-surface-variant">
                No documents found matching the filters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-label-sm uppercase text-on-surface-variant border-b border-border-base/80">
                    <th className="py-2.5 font-semibold">Document Name</th>
                    <th className="py-2.5 font-semibold">Type</th>
                    <th className="py-2.5 font-semibold">Extracted At</th>
                    <th className="py-2.5 font-semibold">Status</th>
                    <th className="py-2.5 font-semibold text-right">Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((d) => {
                    const speed = getSpeedLabel(d.processingTime);
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-border-base/40 hover:bg-surface-container-lowest/30 transition-colors"
                      >
                        <td className="py-3 font-semibold text-secondary mono max-w-[200px] truncate">
                          <Link
                            to={`/review/${encodeURIComponent(d.id)}`}
                            className="hover:underline"
                            title={d.fileName}
                          >
                            {docLabel(d)}
                          </Link>
                        </td>
                        <td className="py-3 text-body-sm text-on-surface-variant">
                          {DOC_TYPE_LABEL[d.docType]}
                        </td>
                        <td className="py-3 text-body-sm text-on-surface-variant whitespace-nowrap">
                          {formatDateTime(d.uploadedAt)}
                        </td>
                        <td className="py-3">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${speed.cls}`}
                            >
                              {speed.label}
                            </span>
                            <span className="mono font-semibold text-text-primary text-body-sm">
                              {d.processingTime !== null &&
                              d.processingTime !== undefined
                                ? `${d.processingTime.toFixed(1)}s`
                                : "—"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {docs.length > 0 && timedDocs.length === 0 && (
            <div className="rounded-lg bg-status-warning/5 p-4 border border-status-warning/20 text-body-sm text-status-warning mt-2">
              <div className="font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-base">warning</span>
                Notice: Existing Documents
              </div>
              <p className="text-[12px] mt-1 text-on-surface-variant/90">
                You have existing processed documents in the database. Because they were analyzed before this update was installed, they do not have speed tracking data. Upload a new document to test and verify the timer performance.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
