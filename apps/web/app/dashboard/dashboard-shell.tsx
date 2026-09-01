'use client';

import { DashboardMain } from './dashboard-main';

// Demo build — no sign-in. The clinician dashboard endpoints still require
// an X-Admin-Password header, so we ship the password the demo seed uses
// and pass it through to DashboardMain. Override via NEXT_PUBLIC_ADMIN_PASSWORD
// if you re-seed with a different value.
const DEMO_PASSWORD =
  process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'clinic2026';

export function DashboardShell() {
  return <DashboardMain adminPassword={DEMO_PASSWORD} onLogout={() => {}} />;
}
