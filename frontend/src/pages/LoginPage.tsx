// Login screen (DocExtract). Split layout: navy hero on the left, sign-in card
// on the right. Credentials are checked by the backend (/auth/login), which
// issues the session token; the role tabs just quick-fill the matching demo
// account — the server decides the actual role.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, type Role } from "../api";
import { useAuth } from "../store";
import { roleHome } from "../lib/auth";

const ROLE_TABS: Role[] = ["user", "staff", "admin"];

const DEMO_ACCOUNTS: Record<Role, { email: string; password: string }> = {
  user: { email: "user@demo", password: "user123" },
  staff: { email: "staff@demo", password: "staff123" },
  admin: { email: "admin@demo", password: "admin123" },
};

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<Role>("user");
  const [email, setEmail] = useState(DEMO_ACCOUNTS.user.email);
  const [password, setPassword] = useState(DEMO_ACCOUNTS.user.password);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function pickTab(r: Role) {
    setSelectedTab(r);
    setEmail(DEMO_ACCOUNTS[r].email);
    setPassword(DEMO_ACCOUNTS[r].password);
    setError(null);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await login(email.trim(), password);
      signIn({ token: res.token, email: res.email, name: res.name, role: res.role });
      navigate(roleHome(res.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left hero */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl">description</span>
          <span className="text-xl font-bold">DocExtract</span>
        </div>
        <div className="relative z-10">
          <h1 className="text-display font-bold leading-tight">
            Intelligent Document Processing
          </h1>
          <p className="mt-4 max-w-md text-body-lg text-white/80">
            Read, validate, and approve documents in seconds. Built for high-volume
            Indonesian financial operations with AI-driven precision.
          </p>
        </div>
        <div className="absolute right-[-80px] top-[-40px] h-80 w-80 rounded-full border-[40px] border-white/5" />
        <div className="absolute bottom-10 left-12 h-64 w-64 rotate-12 rounded-xl border-2 border-white/10" />
      </div>

      {/* Right form */}
      <div className="flex w-full items-center justify-center bg-surface p-6 lg:w-1/2">
        <form onSubmit={handleSignIn} className="w-full max-w-md rounded-lg border border-border-base bg-surface-white p-8 shadow-sm">
          <h2 className="text-headline-lg text-text-primary">Welcome back</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Enter your credentials to access your workspace
          </p>

          <div className="mt-6">
            <div className="mb-1.5 text-label-md text-text-primary">Demo account</div>
            <div className="flex rounded-lg bg-surface-container p-1" role="tablist" aria-label="Demo accounts">
              {ROLE_TABS.map((r) => (
                <button
                  type="button"
                  key={r}
                  role="tab"
                  aria-selected={selectedTab === r}
                  onClick={() => pickTab(r)}
                  className={[
                    "flex-1 rounded-md px-3 py-2 text-body-md font-semibold capitalize transition-colors",
                    selectedTab === r ? "bg-secondary text-white" : "text-on-surface-variant hover:text-text-primary",
                  ].join(" ")}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-body-sm text-on-surface-variant">
              Picking a tab fills that account's credentials for you.
            </p>
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-status-error/30 bg-status-error/5 px-3 py-2.5 text-body-sm text-status-error">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          <label className="mt-5 block">
            <span className="text-label-md text-text-primary">Email Address</span>
            <input
              type="text"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="mt-1.5 h-10 w-full rounded-lg border border-border-base px-3 text-body-md focus:border-secondary focus:outline-none"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-label-md text-text-primary">Password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border-base px-3 text-body-md focus:border-secondary focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
            {!pending && <span className="material-symbols-outlined text-base">arrow_forward</span>}
          </button>

          <p className="mt-6 text-center text-body-sm text-on-surface-variant">
            Demo credentials: <span className="mono">user@demo</span> ·{" "}
            <span className="mono">staff@demo</span> · <span className="mono">admin@demo</span>{" "}
            (password: role + 123)
          </p>
        </form>
      </div>
    </div>
  );
}
