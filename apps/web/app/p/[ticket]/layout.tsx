import { AccessibilityToggle } from '@/components/AccessibilityToggle';
import { AgentSessionProvider } from '@/lib/webmcp/agent-session';
import { AgentApprovalDialog } from '@/components/AgentActivityPanel';

import { PatientAgentTools } from './webmcp-patient-tools';
import { PatientAgentBadge } from './patient-agent-badge';

/**
 * Patient-area layout.
 *
 * Registering the WebMCP tools here rather than per-page means the patient's
 * agent keeps the same tool surface across the queue view and the intake chat —
 * it does not lose `describe_symptoms` because the patient navigated.
 */
export default function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { ticket: string };
}) {
  return (
    <AgentSessionProvider>
      {children}
      <PatientAgentTools ticketId={params.ticket} />
      <PatientAgentBadge />
      <AgentApprovalDialog />
      <AccessibilityToggle />
    </AgentSessionProvider>
  );
}
