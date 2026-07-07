// Route guard: renders children only for the allowed roles. Signed-out users
// go to /login; signed-in users with the wrong role get a friendly no-access
// card (instead of a silent redirect they might mistake for a bug).

import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../store";
import { roleHome } from "../lib/auth";
import type { Role } from "../api";

export default function RequireRole({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { role } = useAuth();
  if (!role) return <Navigate to="/login" replace />;
  if (!allow.includes(role)) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border-base bg-surface-white p-12 text-center">
        <span className="material-symbols-outlined text-5xl text-outline-variant">lock</span>
        <h2 className="mt-3 text-headline-md text-text-primary">No access</h2>
        <p className="mt-1 text-body-md text-on-surface-variant">
          The <span className="font-semibold capitalize">{role}</span> role doesn't have access to
          this page.
        </p>
        <Link
          to={roleHome(role)}
          className="mt-4 inline-block font-semibold text-secondary hover:underline"
        >
          Go to your workspace →
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
