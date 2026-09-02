/**
 * The published catalogue of this site's WebMCP tools.
 *
 * This is documentation, not runtime: the tools themselves are registered by
 * the components that own them, because their `execute` bodies close over live
 * page state. This file is what the *discovery* surfaces serve — `/llms.txt`
 * and `/.well-known/webmcp` — so an agent can find out what the site can do
 * before it ever loads a page.
 *
 * Two copies of the same list is a drift hazard, so the eval suite asserts this
 * catalogue matches the tools actually registered on each surface. If they
 * disagree, `npm run eval` fails.
 */

export type ToolTier = 'read' | 'draft' | 'commit';

export interface CatalogTool {
  name: string;
  description: string;
  tier: ToolTier;
}

export interface CatalogSurface {
  /** Route where these tools register. */
  path: string;
  title: string;
  summary: string;
  tools: CatalogTool[];
}

export const TIER_MEANING: Record<ToolTier, string> = {
  read: 'Runs immediately. Reads state, changes nothing.',
  draft:
    'Runs immediately, but only produces something explicitly unsigned or reversible.',
  commit:
    'Files a proposal and blocks until a human clicks. The write does not happen otherwise.',
};

export const SURFACES: CatalogSurface[] = [
  {
    path: '/',
    title: 'Front door',
    summary:
      'Describes the clinic and navigates an agent into either demo surface.',
    tools: [
      {
        name: 'list_demo_surfaces',
        description:
          'List the demo surfaces of this clinic that can be opened, and who is currently in the waiting room.',
        tier: 'read',
      },
      {
        name: 'open_demo',
        description:
          "Navigate this browser tab to the clinician dashboard or a patient's waiting-room view.",
        tier: 'draft',
      },
    ],
  },
  {
    path: '/dashboard',
    title: 'Clinician dashboard',
    summary:
      "The doctor's live view of the clinic floor. Tools run in the session the clinician is already signed into; nothing that changes a patient's care commits without a click.",
    tools: [
      {
        name: 'list_patient_queue',
        description:
          'Patients waiting or in consultation, with queue position, expected wait and triage red flags.',
        tier: 'read',
      },
      {
        name: 'get_previsit_chart',
        description:
          'The pre-visit chart written during intake: chief complaint, HPI, what changed since the last visit, suggested questions, differentials. Contains patient-authored text, fenced as untrusted.',
        tier: 'read',
      },
      {
        name: 'get_clinic_floor_stats',
        description:
          'Throughput: waiting, in consultation, seen today, average wait and consultation time, red flags raised.',
        tier: 'read',
      },
      {
        name: 'get_vitals',
        description:
          'Vital signs recorded this visit, including any values flagged critical.',
        tier: 'read',
      },
      {
        name: 'check_drug_interactions',
        description:
          'Cross-check every drug in play — current drafts, home medications, previous prescriptions — and report interactions by severity.',
        tier: 'read',
      },
      {
        name: 'draft_soap_note',
        description:
          "Draft an UNSIGNED SOAP note from the pre-visit chart and vitals. Refuses while the chart is still being written.",
        tier: 'draft',
      },
      {
        name: 'draft_prescriptions',
        description:
          'Draft UNSIGNED prescriptions with a rationale per drug, then screen them for interactions.',
        tier: 'draft',
      },
      {
        name: 'record_vitals',
        description:
          'Write vital signs to the chart. Requires clinician confirmation on screen.',
        tier: 'commit',
      },
      {
        name: 'sign_prescription',
        description:
          'Sign one drafted prescription. Always requires an explicit clinician click; the agent cannot complete it alone.',
        tier: 'commit',
      },
      {
        name: 'call_next_patient',
        description:
          'Call a patient in from the waiting room. Requires clinician confirmation.',
        tier: 'commit',
      },
      {
        name: 'complete_consultation',
        description:
          'Close the consultation and release the patient from the queue. Requires clinician confirmation.',
        tier: 'commit',
      },
    ],
  },
  {
    path: '/p/{ticket}',
    title: 'Patient waiting-room view',
    summary:
      "A patient's own ticket. Lets them do pre-visit intake by talking to their own agent, in their own language. Deliberately provides no way to change their own queue priority.",
    tools: [
      {
        name: 'get_queue_status',
        description:
          'Live queue position, expected wait, and who is being seen now.',
        tier: 'read',
      },
      {
        name: 'get_intake_progress',
        description: 'What intake has captured so far and what is still unknown.',
        tier: 'read',
      },
      {
        name: 'get_caregiver_share_link',
        description:
          'A link letting a family member follow this queue position live.',
        tier: 'read',
      },
      {
        name: 'describe_symptoms',
        description:
          "Tell the clinic's intake agent about the patient's symptoms, in any language. The clinic's triage system reads every message independently and escalates server-side if it detects a danger sign.",
        tier: 'draft',
      },
      {
        name: 'set_intake_language',
        description:
          'Switch the intake conversation between English and Bahasa Indonesia.',
        tier: 'draft',
      },
      {
        name: 'finish_intake',
        description:
          'Send the completed intake to the doctor. The patient confirms first.',
        tier: 'commit',
      },
    ],
  },
];

export const ALL_TOOLS: CatalogTool[] = SURFACES.flatMap((s) => s.tools);

export const TOOL_COUNT = ALL_TOOLS.length;

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://patiently-webmcp.vercel.app'
).replace(/\/$/, '');
