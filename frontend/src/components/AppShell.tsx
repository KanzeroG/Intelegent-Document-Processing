import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, useDocuments } from "../store";
import { API_BASE_URL, type Role } from "../api";

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
  const { loadError, dismissError, reload } = useDocuments();
  const navigate = useNavigate();
  const location = useLocation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); // For desktop sidebar
  const [profileOpen, setProfileOpen] = useState(false);

  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  function closeDrawer(returnFocus = false) {
    setDrawerOpen(false);
    if (returnFocus) hamburgerRef.current?.focus();
  }

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Handle clicking outside profile popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  const visibleNav = NAV.filter((item) => role && item.roles.includes(role));

  const sidebarWidth = isCollapsed ? "w-[72px]" : "w-[260px]";

  return (
    <div className="flex h-screen bg-surface-white text-on-background overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => closeDrawer(true)}
          aria-hidden="true"
        />
      )}

      {/* Floating Mobile Hamburger */}
      {!drawerOpen && (
        <button
          ref={hamburgerRef}
          onClick={() => setDrawerOpen(true)}
          className="fixed left-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-full bg-surface-container-low text-on-surface-variant shadow-sm hover:bg-surface-container lg:hidden"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
      )}

      {/* Sidebar (Desktop Collapsible, Mobile Drawer) */}
      <aside
        aria-label="Main navigation"
        className={[
          "fixed left-0 top-0 z-50 flex h-screen flex-col bg-surface-container-low transition-all duration-300 lg:relative lg:translate-x-0 border-r border-border-base",
          sidebarWidth,
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3 px-4"} py-4 h-16`}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors lg:flex hidden"
            title="Toggle Menu"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          
          {/* Mobile close button inside drawer */}
          <button
            onClick={() => closeDrawer()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors lg:hidden"
          >
            <span className="material-symbols-outlined">menu_open</span>
          </button>

          {!isCollapsed && (
            <div className="leading-tight overflow-hidden text-primary whitespace-nowrap">
              <div className="text-lg font-bold">DocExtract</div>
            </div>
          )}
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3 overflow-y-auto overflow-x-hidden">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-full py-2.5 transition-colors whitespace-nowrap",
                  isCollapsed ? "justify-center px-0 w-10 h-10 mx-auto" : "px-4",
                  isActive
                    ? "bg-secondary-container text-on-secondary-container font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container",
                ].join(" ")
              }
            >
              <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              {!isCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Profile Bottom Section */}
        <div className="p-3 relative" ref={profileRef}>
          {profileOpen && (
            <div className="absolute bottom-full left-3 mb-2 w-56 rounded-2xl bg-surface-white p-2 shadow-lg border border-border-base z-50">
              <div className="px-3 py-3 border-b border-border-base mb-2">
                <div className="font-semibold text-text-primary truncate">{user?.name ?? "—"}</div>
                <div className="text-xs text-on-surface-variant uppercase mt-0.5">{role}</div>
              </div>
              <button
                onClick={() => {
                  signOut();
                  navigate("/login");
                }}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-status-error hover:bg-status-error/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Sign out
              </button>
            </div>
          )}
          
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={[
              "flex items-center rounded-full hover:bg-surface-container transition-colors",
              isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 p-2 w-full text-left"
            ].join(" ")}
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-sm font-semibold text-on-primary-container">
              {(user?.name ?? "?").charAt(0).toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="flex-1 truncate">
                <div className="text-sm font-semibold text-text-primary truncate">{user?.name ?? "—"}</div>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col relative h-full">
        {loadError && (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-status-warning/30 bg-status-warning/10 px-gutter py-2.5 text-body-sm text-status-warning z-20"
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

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
