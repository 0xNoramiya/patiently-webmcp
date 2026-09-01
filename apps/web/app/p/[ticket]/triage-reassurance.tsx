'use client';

import { cn } from '@/lib/utils';

interface ReassuranceCopy {
  /** Short title the patient sees first. Reassuring, not alarming. */
  title: string;
  /** 1-2 sentence explanation in patient-friendly language. */
  explanation: string;
  /** "While you wait, please…" — short imperative actions. */
  doNow: string[];
  /** "Tell staff right away if…" — escalation triggers in plain words. */
  watchFor: string[];
}

const COPY: Record<string, ReassuranceCopy> = {
  CHEST_PAIN_CARDIAC: {
    title: "We've moved you up — a clinician is on the way",
    explanation:
      "Because of the chest symptoms you described, we're getting you seen as quickly as possible. Your queue number hasn't changed — you'll just be called sooner.",
    doNow: [
      'Stay seated. Don\'t drive yourself anywhere.',
      'Loosen any tight clothing around your chest.',
      "If you take aspirin and aren't allergic, ask staff before taking any.",
    ],
    watchFor: [
      'Chest pain becomes worse or spreads further',
      'You feel faint, very dizzy, or pass out',
      "You're suddenly more short of breath",
      'You break out in heavy cold sweats',
    ],
  },
  STROKE_SYMPTOMS: {
    title: "We've moved you up — please stay still",
    explanation:
      "Some of what you described needs urgent attention. We've alerted the clinical team — you'll be called soon.",
    doNow: [
      'Stay seated. A staff member will come to you if you struggle to walk.',
      'Have someone you trust stay with you if possible.',
      'Try not to eat or drink anything until you\'ve been seen.',
    ],
    watchFor: [
      'Weakness or numbness on one side gets worse',
      'Speech becomes more slurred or you can\'t find words',
      'Vision gets blurry in one or both eyes',
      'A severe headache comes on or worsens',
    ],
  },
  RESPIRATORY_DISTRESS: {
    title: 'A nurse is coming to you — stay calm',
    explanation:
      "We've prioritised your visit because of your breathing. Try to relax — slow, even breaths help while we get you seen.",
    doNow: [
      'Sit up straight. Don\'t lie down.',
      'Loosen anything tight around your neck or chest.',
      "If you have an inhaler, you can use it as you normally would.",
    ],
    watchFor: [
      "You can't speak in full sentences",
      'Your lips or fingertips look bluish',
      'You feel very dizzy or about to faint',
    ],
  },
  ANAPHYLAXIS_SUSPECT: {
    title: 'Urgent — a clinician has been notified',
    explanation:
      "From what you described, this might be a serious allergic reaction. A team member is on the way to you now.",
    doNow: [
      "If you have an EpiPen or auto-injector, tell staff right away.",
      'Stay seated. Avoid eating or drinking.',
      "Don't take any new medication until you've been seen.",
    ],
    watchFor: [
      'Your throat or tongue feels more swollen',
      'Breathing becomes harder',
      'You feel faint, light-headed, or about to pass out',
    ],
  },
  PEDS_RED_FLAG: {
    title: 'Your child has been moved up the queue',
    explanation:
      "Based on what you've shared, a clinician will see your child as soon as possible. Stay close.",
    doNow: [
      'Keep your child with you in the waiting area — do not leave.',
      'Offer small sips of water unless your child is vomiting.',
      "Don't give any new medicines until you've spoken to the doctor.",
    ],
    watchFor: [
      'Breathing gets faster, noisier, or harder',
      "Your child becomes very sleepy or hard to wake",
      'Vomiting continues or there\'s blood in vomit or stool',
      'A new rash appears that doesn\'t fade when pressed',
    ],
  },
  SEVERE_DEHYDRATION: {
    title: "We've moved you up — please rest",
    explanation:
      "From what you described, you may be quite dehydrated. We'll get fluids started as soon as you're seen.",
    doNow: [
      'Stay seated. Standing may make you feel faint.',
      'Take small sips of water if you can keep it down.',
      'Avoid sugary or caffeinated drinks for now.',
    ],
    watchFor: [
      'You feel about to pass out',
      'Confusion or trouble staying awake',
      'You start vomiting blood',
    ],
  },
  OBSTETRIC_BLEEDING: {
    title: "We've prioritised your visit",
    explanation:
      "Because of the bleeding you described, we're getting you seen quickly. The team has been notified.",
    doNow: [
      'Stay seated and rest.',
      'Have someone you trust stay with you if possible.',
      "Don't eat or drink anything until you\'ve been seen.",
    ],
    watchFor: [
      'The bleeding becomes heavier',
      'You feel light-headed or faint',
      'You have severe abdominal pain',
    ],
  },
  SUICIDAL_IDEATION: {
    title: "We're here — you don't have to wait this out alone",
    explanation:
      "Thank you for telling us. A counsellor has been notified and will see you as soon as possible. You're safe here.",
    doNow: [
      'Please stay where you are — we\'ll come to you.',
      'If you have a friend or family member nearby, you can ask them to sit with you.',
      'A clinician will be with you shortly.',
    ],
    watchFor: [],
  },
};

const GENERIC: ReassuranceCopy = {
  title: "You've been moved up the queue",
  explanation:
    "Based on what you shared, we've prioritised your visit. The clinical team has been notified.",
  doNow: [
    'Stay in the waiting area — we\'ll call you soon.',
    "If you're with family or a friend, let them stay with you.",
  ],
  watchFor: ['Your symptoms get noticeably worse', 'You feel faint or unwell'],
};

function pickCopy(flags: string[]): ReassuranceCopy {
  for (const f of flags) {
    if (COPY[f]) return COPY[f];
  }
  return GENERIC;
}

export function TriageReassurance({
  flags,
  ticketNumber,
}: {
  flags: string[];
  ticketNumber: string;
}) {
  if (!flags || flags.length === 0) return null;
  const copy = pickCopy(flags);

  return (
    <section
      className={cn(
        'card-padded slide-fade-up',
        'bg-gradient-to-br from-warn-50 to-white border-warn-100'
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-2xl bg-warn-100 text-warn-600 grid place-items-center text-base font-bold shrink-0 step-glow">
          ★
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-warn-600 font-bold">
            Priority raised · staff notified
          </div>
          <h3 className="font-display font-bold text-ink-900 text-base mt-0.5">
            {copy.title}
          </h3>
          <p className="text-sm text-ink-700 mt-1.5">{copy.explanation}</p>
        </div>
      </div>

      {copy.doNow.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-1.5">
            While you wait
          </div>
          <ul className="space-y-1.5">
            {copy.doNow.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-700">
                <span className="text-brand-600 shrink-0">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {copy.watchFor.length > 0 && (
        <div className="mt-4 rounded-xl bg-white border border-ink-100 p-3">
          <div className="text-[10px] uppercase tracking-wider text-alert-700 font-bold mb-1.5">
            Tell any staff member right away if
          </div>
          <ul className="space-y-1.5">
            {copy.watchFor.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-700">
                <span className="text-alert-600 shrink-0">⚠</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-ink-500">
          Your ticket{' '}
          <span className="font-display font-bold text-ink-900 text-sm">
            {ticketNumber}
          </span>{' '}
          stays the same — you'll be called by it.
        </span>
        {flags.length > 1 && (
          <span className="text-ink-400">+{flags.length - 1} more flag</span>
        )}
      </div>
    </section>
  );
}
