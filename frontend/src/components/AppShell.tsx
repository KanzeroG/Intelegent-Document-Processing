// Fixed app shell: navy sidebar (260px) + white topbar (64px), per the
// DocExtract design system. Page content renders through <Outlet/>.

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../store";
import type { Role } from "../api";

const NAV = [
  { to: "/upload", label: "Upload", icon: "upload_file" },
  { to: "/review", label: "Review Queue", icon: "fact_check" },
  { to: "/dashboard", label: "Dashboard", icon: "monitoring" },
];

const ROLES: Role[] = ["user", "staff", "admin"];

export default function AppShell() {
  const { role, signIn, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background text-on-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-sidebar-width flex-col bg-primary p-4 text-white">
        <div className="flex items-center gap-3 px-2 py-4">
          <span className="material-symbols-outlined text-3xl text-inverse-primary">
            description
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold">DocExtract</div>
            <div className="text-[10px] uppercase tracking-widest text-on-primary-container">
              Intelligent Processing
            </div>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md font-semibold transition-colors",
                  isActive
                    ? "bg-secondary text-white"
                    : "text-on-primary-container hover:bg-white/5 hover:text-white",
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
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md text-on-primary-container transition-colors hover:bg-white/5 hover:text-white"
        >
          <span className="material-symbols-outlined text-xl">logout</span>
          Sign out
        </button>
      </aside>

      {/* Main column */}
      <div className="ml-sidebar-width flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-topbar-height items-center justify-end gap-4 border-b border-border-base bg-surface-white px-gutter">
          <button className="material-symbols-outlined text-on-surface-variant" aria-label="Notifications">
            notifications
          </button>
          <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-base">badge</span>
            <select
              value={role ?? "user"}
              onChange={(e) => signIn(e.target.value as Role)}
              className="rounded-lg border border-border-base bg-surface-white px-3 py-1.5 text-body-md font-semibold capitalize text-text-primary"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-sm font-semibold text-white">
            {(role ?? "u").charAt(0).toUpperCase()}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-gutter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
