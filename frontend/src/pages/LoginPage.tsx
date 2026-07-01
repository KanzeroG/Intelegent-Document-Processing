// Login screen (DocExtract). Split layout: navy hero on the left, sign-in card
// on the right with User/Staff/Admin role tabs. Auth is stubbed — choosing a
// role and clicking Sign in enters the app.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store";
import type { Role } from "../api";

const ROLE_TABS: Role[] = ["user", "staff", "admin"];

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("user");

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    signIn(role);
    navigate("/upload");
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
          <p className="mt-4 max-w-md text-body-lg text-on-primary-container">
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
            Enter your credentials to access your dashboard
          </p>

          <div className="mt-6">
            <div className="mb-1.5 text-label-md text-text-primary">Sign in as</div>
            <div className="flex rounded-lg bg-surface-container p-1">
              {ROLE_TABS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={[
                    "flex-1 rounded-md px-3 py-2 text-body-md font-semibold capitalize transition-colors",
                    role === r ? "bg-secondary text-white" : "text-on-surface-variant",
                  ].join(" ")}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-label-md text-text-primary">Email Address</span>
            <input
              type="email"
              defaultValue="demo@company.com"
              placeholder="name@company.com"
              className="mt-1.5 h-10 w-full rounded-lg border border-border-base px-3 text-body-md focus:border-secondary focus:outline-none"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-label-md text-text-primary">Password</span>
            <input
              type="password"
              defaultValue="password"
              className="mt-1.5 h-10 w-full rounded-lg border border-border-base px-3 text-body-md focus:border-secondary focus:outline-none"
            />
          </label>

          <button
            type="submit"
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary-container"
          >
            Sign in
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>

          <p className="mt-6 text-center text-body-sm text-on-surface-variant">
            New to DocExtract? <span className="font-semibold text-secondary">Request Access</span>
          </p>
        </form>
      </div>
    </div>
  );
}
