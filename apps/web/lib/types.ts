export type Poli = 'umum' | 'anak' | 'kia' | 'gigi' | 'lansia';

export const POLI_LABEL: Record<Poli, string> = {
  umum: 'General Clinic',
  anak: 'Pediatrics',
  kia: 'OB-GYN',
  gigi: 'Dental',
  lansia: 'Geriatrics',
};

export const POLI_PREFIX: Record<Poli, string> = {
  umum: 'A',
  anak: 'B',
  kia: 'C',
  gigi: 'D',
  lansia: 'E',
};

export type TicketStatus =
  | 'waiting'
  | 'in_intake'
  | 'intake_complete'
  | 'in_consultation'
  | 'done'
  | 'cancelled';

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  waiting: 'Waiting',
  in_intake: 'In intake',
  intake_complete: 'Ready for doctor',
  in_consultation: 'In consultation',
  done: 'Done',
  cancelled: 'Cancelled',
};

export type Payer = 'bpjs' | 'umum';

export const PAYER_LABEL: Record<Payer, string> = {
  bpjs: 'Insurance',
  umum: 'Self-pay',
};

export interface Patient {
  id: string;
  nik: string | null;
  name: string;
  dob: string;
  sex: 'M' | 'F';
  phone: string | null;
  bpjs_number: string | null;
  age: number;
}

export interface Prescription {
  id: string;
  drug_name: string;
  dose: string;
  frequency: string;
  duration_days: number;
  instructions: string | null;
}

export interface Visit {
  id: string;
  visit_date: string;
  poli: Poli;
  chief_complaint: string;
  diagnosis_icd10: string | null;
  notes: string | null;
  prescriber_id: string | null;
  prescriptions: Prescription[];
}

export interface Ticket {
  id: string;
  ticket_number: string;
  poli: Poli;
  payer: Payer;
  status: TicketStatus;
  priority: number;
  is_followup: boolean;
  issued_at: string;
  called_at: string | null;
  completed_at: string | null;
}

export interface TicketDetail extends Ticket {
  patient: Patient;
  previous_visit: Visit | null;
  triage_flags: string[];
  intake_complete: boolean;
}

export interface QueueEntry {
  ticket: Ticket;
  patient: Patient;
  position: number;
  eta_minutes_low: number;
  eta_minutes_high: number;
  triage_flags: string[];
}

export interface QueueState {
  poli: Poli;
  now_serving: Ticket | null;
  avg_consultation_minutes: number;
  waiting: QueueEntry[];
  in_intake: QueueEntry[];
  intake_complete: QueueEntry[];
  in_consultation: QueueEntry[];
}

export interface IntakeMessage {
  id: string;
  role: 'agent' | 'patient' | 'system';
  content: string;
  created_at: string;
}

export interface IntakeSummary {
  chief_complaint: string;
  hpi_paragraph: string;
  relevant_history: string[];
  triage_assessment: string;
  followup_delta: {
    previous_treatment?: string;
    adherence?: string;
    symptom_response?: string;
    side_effects?: string[];
    clinical_interpretation?: string;
  } | null;
  suggested_questions: string[];
  differentials: string[];
}

export interface IntakeSession {
  id: string;
  ticket_id: string;
  status: 'active' | 'completed' | 'abandoned';
  structured_data: Record<string, unknown>;
  triage_flags: string[];
  summary: IntakeSummary | null;
  language?: 'en' | 'id';
  started_at: string;
  completed_at: string | null;
  messages: IntakeMessage[];
}

export interface AgentResponse {
  reply_text: string;
  extracted_fields: Record<string, unknown>;
  triage_flags: string[];
  triage_reasoning?: string;
  is_complete: boolean;
}

export interface AppointmentReminder {
  id: string;
  patient: Patient;
  scheduled_for: string;
  appointment_at: string;
  reason: string;
  channel: string;
  status: 'pending' | 'sent' | 'cancelled' | 'error';
  message: string | null;
  model_used: string | null;
  error: string | null;
  generated_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ConsultationNoteOut {
  id: string;
  ticket_id: string;
  status: 'pending' | 'drafting' | 'done' | 'failed';
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  model_used: string | null;
  error: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface ConsultationTranscriptOut {
  id: string;
  ticket_id: string;
  audio_path: string;
  status: 'pending' | 'transcribing' | 'done' | 'failed';
  transcript_text: string | null;
  error: string | null;
  speechmatics_job_id: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface PrescriptionDraftOut {
  id: string;
  ticket_id: string;
  drug_name: string;
  dose: string;
  frequency: string;
  duration_days: number;
  instructions: string | null;
  rationale: string | null;
  source: string;
  approved: boolean;
  created_at: string | null;
}

export interface DrugInteraction {
  drug_a: string;
  drug_b: string;
  severity: 'major' | 'moderate' | 'minor';
  rationale: string;
}

export interface InteractionsReport {
  ticket_id: string;
  drug_count: number;
  sources: {
    drafts: string[];
    home_meds: string[];
    previous_rx: string[];
  };
  interactions: DrugInteraction[];
  by_severity: { major?: number; moderate?: number; minor?: number };
}

export interface VitalSignsOut {
  id: string;
  ticket_id: string;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  temperature_c: number | null;
  spo2: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  pain_score: number | null;
  recorded_by: string | null;
  critical_findings: string[];
  critical_labels: string[];
  recorded_at: string | null;
  updated_at: string | null;
}

export interface VitalSignsIn {
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  heart_rate?: number | null;
  respiratory_rate?: number | null;
  temperature_c?: number | null;
  spo2?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  pain_score?: number | null;
  recorded_by?: string | null;
}

export interface ClinicStats {
  as_of: string;
  tickets: {
    waiting: number;
    in_consultation: number;
    seen_today: number;
    by_status: Record<string, number>;
    by_poli_active: Record<string, number>;
  };
  intakes_completed_today: number;
  triage: {
    total_today: number;
    by_flag: Record<string, number>;
  };
  avg_consult_minutes: number | null;
  avg_wait_minutes: number | null;
  reminders: { sent_today: number; pending: number };
  transcripts_today: number;
  notes_today: number;
}

export const RED_FLAG_LABELS: Record<string, string> = {
  CHEST_PAIN_CARDIAC: 'Possible acute coronary syndrome',
  STROKE_SYMPTOMS: 'Acute stroke symptoms',
  RESPIRATORY_DISTRESS: 'Respiratory distress',
  OBSTETRIC_BLEEDING: 'Obstetric bleeding',
  PEDS_RED_FLAG: 'Pediatric red flag',
  SEVERE_DEHYDRATION: 'Severe dehydration',
  ANAPHYLAXIS_SUSPECT: 'Suspected anaphylaxis',
  SUICIDAL_IDEATION: 'Suicidal ideation',
};
