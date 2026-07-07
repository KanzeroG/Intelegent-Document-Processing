// App shell: navy sidebar (260px) + white topbar (64px), per the DocExtract
// design system. At lg+ the sidebar is fixed; below lg it becomes an
// off-canvas drawer behind a hamburger button. Page content renders through
// <Outlet/>.
//
// Stacking order: page content (auto) < topbar (z-30) < drawer backdrop
// (z-40, so it dims the topbar too) < sidebar/drawer (z-50) < toasts
// (react-hot-toast default 9999).

import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, useDocuments } from "../store";
import { API_BASE_URL, type Role } from "../api";
import { docLabel } from "../lib/format";

const NAV: { to: string; label: string; icon: string; roles: Role[] }[] = [
  { to: "/upload", label: "Upload", icon: "upload_file", roles: ["user", "staff", "admin"] },
  { to: "/review", label: "Review Queue", icon: "fact_check", roles: ["staff", "admin"] },
  { to: "/dashboard", label: "Dashboard", icon: "monitoring", roles: ["staff", "admin"] },
  { to: "/chat", label: "Assistant", icon: "forum", roles: ["user", "staff", "admin"] },
  { to: "/audit", label: "Audit Log", icon: "history", roles: ["admin"] },
  { to: "/performance", label: "Model Speed", icon: "speed", roles: ["admin"] },
  { to: "/admin/settings", label: "Settings", icon: "settings", roles: ["admin"] },
];

export default function AppShell() {
  const { user, role, signOut } = useAuth();
  const { docs, loadError, dismissError, reload } = useDocuments();
  const navigate = useNavigate();
  const location = useLocation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const firstNavRef = useRef<HTMLAnchorElement>(null);

  // Explicit closes (backdrop, Escape) hand focus back to the hamburger.
  function closeDrawer(returnFocus = false) {
    setDrawerOpen(false);
    if (returnFocus) hamburgerRef.current?.focus();
  }

  // Navigating from a drawer link should also collapse it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Keyboard support while the drawer is open: Escape closes, focus moves in.
  useEffect(() => {
    if (!drawerOpen) return;
    firstNavRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Topbar title: the current page, so the bar's left half isn't empty.
  function pageTitle(): string {
    const p = location.pathname;
    if (p.startsWith("/review/")) {
      const id = decodeURIComponent(p.slice("/review/".length));
      const doc = docs.find((d) => d.id === id);
      return doc ? `Review › ${docLabel(doc)}` : "Review";
    }
    if (p.startsWith("/review")) return "Review Queue";
    if (p.startsWith("/upload")) return "Upload Documents";
    if (p.startsWith("/dashboard")) return "Monitoring Dashboard";
    if (p.startsWith("/chat")) return "Assistant";
    if (p.startsWith("/audit")) return "Audit Log";
    if (p.startsWith("/performance")) return "Model Performance";
    if (p.startsWith("/admin/settings")) return "Settings";
    return "DocExtract";
  }

  const visibleNav = NAV.filter((item) => role && item.roles.includes(role));

  return (
    <div className="flex min-h-screen bg-background text-on-background">
      {/* Drawer backdrop (mobile only) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => closeDrawer(true)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar / off-canvas drawer */}
      <aside
        aria-label="Main navigation"
        className={[
          "fixed left-0 top-0 z-50 flex h-screen w-sidebar-width flex-col bg-primary p-4 text-white",
          "transition-transform duration-200 lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center gap-3 px-2 py-4">
          <span className="material-symbols-outlined text-3xl text-inverse-primary">
            description
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold">DocExtract</div>
            <div className="text-[10px] uppercase tracking-widest text-white/60">
              Intelligent Processing
            </div>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {visibleNav.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              ref={i === 0 ? firstNavRef : undefined}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md font-semibold transition-colors",
                  isActive
                    ? "bg-secondary text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white",
                ].join(" ")
              }
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => {
            signOut();
            navigate("/login");
          }}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md text-white/80 transition-colors hover:bg-white/5 hover:text-white"
        >
          <span className="material-symbols-outlined text-xl">logout</span>
          Sign out
        </button>
      </aside>

      {/* Main column — full width below lg, offset by the fixed sidebar at lg+ */}
      <div className="flex min-w-0 flex-1 flex-col lg:ml-sidebar-width">
        <header className="sticky top-0 z-30 flex h-topbar-height items-center justify-between gap-4 border-b border-border-base bg-surface-white px-gutter">
          <div className="flex min-w-0 items-center gap-2">
            <button
              ref={hamburgerRef}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-container lg:hidden"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h1 className="truncate text-body-lg font-semibold text-text-primary">{pageTitle()}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <button
              className="material-symbols-outlined text-on-surface-variant"
              aria-label="Notifications"
            >
              notifications
            </button>
            <div className="hidden text-right sm:block">
              <div className="text-body-sm font-semibold text-text-primary">
                {user?.name ?? "—"}
              </div>
              <div className="text-label-sm uppercase text-on-surface-variant">{role}</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-sm font-semibold text-white">
              {(user?.name ?? "?").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Backend connectivity banner (document list failed to load). */}
        {loadError && (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-status-warning/30 bg-status-warning/10 px-gutter py-2.5 text-body-sm text-status-warning"
          >
            <span className="material-symbols-outlined text-base shrink-0">cloud_off</span>
            <span className="min-w-0 flex-1 truncate">
              Couldn't load documents — is the backend running at {API_BASE_URL}? ({loadError})
            </span>
            <button onClick={() => void reload()} className="shrink-0 font-semibold hover:underline">
              Retry
            </button>
            <button
              onClick={dismissError}
              aria-label="Dismiss"
              className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-status-warning/10"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-gutter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
