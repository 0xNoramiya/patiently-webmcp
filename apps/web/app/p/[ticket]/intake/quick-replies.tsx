'use client';

/**
 * Quick-reply suggestion chips.
 *
 * Looks at the agent's last message and offers 2–5 tappable replies the
 * patient can use instead of typing on a phone keyboard. Heuristics only —
 * no LLM round-trip. Patterns are matched in priority order; the FIRST
 * one that hits wins, so the more specific patterns come first.
 *
 * Tapping a chip fills the textarea (it does NOT auto-send) so the
 * patient can edit before hitting the send button — important because
 * the agent may have meant something slightly different.
 */
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

type Lang = 'en' | 'id';

interface Pattern {
  /** Optional language to restrict this pattern to */
  language?: Lang;
  /** Regexes that must ALL match the lowercase agent message */
  match: RegExp[];
  /** Replies — picked by language at render time */
  replies: { en: string[]; id: string[] };
}

const PATTERNS: Pattern[] = [
  // 1. Follow-up symptom delta: "better, the same, or worse"
  {
    match: [/\b(better|worse|same)\b.*\b(better|worse|same)\b/],
    replies: {
      en: ['Mostly better', 'About the same', 'A bit worse'],
      id: ['Sudah mendingan', 'Sama saja', 'Malah lebih parah'],
    },
  },
  {
    match: [/\b(lebih baik|membaik|mendingan|sama saja|lebih (parah|buruk))\b/],
    replies: {
      en: ['Mostly better', 'About the same', 'A bit worse'],
      id: ['Sudah mendingan', 'Sama saja', 'Malah lebih parah'],
    },
  },

  // 2. Pain / severity scale 0-10 — offer a ladder
  {
    match: [/\b(scale|skala)\b.*\b(0|1)\b.*\b10\b/],
    replies: {
      en: ['2 · mild', '5 · moderate', '7 · severe', '9 · very severe'],
      id: ['2 · ringan', '5 · sedang', '7 · berat', '9 · sangat berat'],
    },
  },
  {
    match: [/\b(1|0)\s*(to|sampai|-)\s*10\b/],
    replies: {
      en: ['2 · mild', '5 · moderate', '7 · severe', '9 · very severe'],
      id: ['2 · ringan', '5 · sedang', '7 · berat', '9 · sangat berat'],
    },
  },

  // 3. Medication adherence — "took all / some / none", "did you finish"
  {
    match: [/\b(took|finish(?:ed)?|adherence|completed)\b.*\b(all|none|some|course|medication|meds?)\b/],
    replies: {
      en: ['Took all of it', 'Some of it', "Didn't take it"],
      id: ['Habis semua', 'Sebagian', 'Tidak diminum'],
    },
  },
  {
    match: [/\b(habis|minum|diminum)\b.*\b(semua|sebagian|tidak|belum|obat)\b/],
    replies: {
      en: ['Took all of it', 'Some of it', "Didn't take it"],
      id: ['Habis semua', 'Sebagian', 'Tidak diminum'],
    },
  },

  // 4. Duration — "how long", "how many days"
  {
    match: [/\b(how long|how many (days|hours|weeks)|since when)\b/],
    replies: {
      en: ['A few hours', 'About a day', 'A few days', 'Over a week'],
      id: ['Beberapa jam', 'Sekitar sehari', 'Beberapa hari', 'Lebih dari seminggu'],
    },
  },
  {
    match: [/\b(berapa (lama|hari|jam)|sejak kapan|sudah berapa)\b/],
    replies: {
      en: ['A few hours', 'About a day', 'A few days', 'Over a week'],
      id: ['Beberapa jam', 'Sekitar sehari', 'Beberapa hari', 'Lebih dari seminggu'],
    },
  },

  // 5. Quality / character of pain — "describe", "feels like", "what kind"
  {
    match: [/\b(describe|feels? like|what (kind|sort)|sharp|dull|throbbing|burning)\b/],
    replies: {
      en: ['Sharp', 'Dull / aching', 'Throbbing', 'Burning'],
      id: ['Tajam', 'Tumpul / nyut-nyutan', 'Berdenyut', 'Panas / terbakar'],
    },
  },
  {
    match: [/\b(rasanya seperti|seperti apa|tajam|tumpul|berdenyut|panas|terbakar)\b/],
    replies: {
      en: ['Sharp', 'Dull / aching', 'Throbbing', 'Burning'],
      id: ['Tajam', 'Tumpul / nyut-nyutan', 'Berdenyut', 'Panas / terbakar'],
    },
  },

  // 6. Side effects — "any side effects"
  {
    match: [/\b(side effect|adverse|reaction to (?:the )?med)/],
    replies: {
      en: ['None at all', 'A little upset stomach', 'Made me drowsy', 'Yes — see below'],
      id: ['Tidak ada', 'Sedikit mual', 'Bikin ngantuk', 'Ya — saya jelaskan'],
    },
  },
  {
    match: [/\b(efek samping|gangguan obat)\b/],
    replies: {
      en: ['None at all', 'A little upset stomach', 'Made me drowsy', 'Yes — see below'],
      id: ['Tidak ada', 'Sedikit mual', 'Bikin ngantuk', 'Ya — saya jelaskan'],
    },
  },

  // 7. Universal-ish yes/no — last because the heuristic is broad. We only
  //    fire on common question stems so we don't suggest Y/N for open
  //    questions like "tell me more".
  {
    match: [/\b(do you|did you|have you|are you|is (it|that)|can you)\b.*\?/],
    replies: {
      en: ['Yes', 'No', "I'm not sure"],
      id: ['Ya', 'Tidak', 'Saya kurang yakin'],
    },
  },
  {
    match: [/\b(apakah|apa Anda|sudah Anda|pernah Anda)\b.*\?/i],
    replies: {
      en: ['Yes', 'No', "I'm not sure"],
      id: ['Ya', 'Tidak', 'Saya kurang yakin'],
    },
  },
];

export function suggestReplies(
  agentMessage: string,
  language: Lang = 'en'
): string[] {
  if (!agentMessage) return [];
  const text = agentMessage.toLowerCase();
  for (const p of PATTERNS) {
    if (p.language && p.language !== language) continue;
    if (p.match.every((re) => re.test(text))) {
      return p.replies[language];
    }
  }
  return [];
}

export function QuickReplies({
  agentMessage,
  language,
  onPick,
}: {
  agentMessage: string | null | undefined;
  language: Lang;
  onPick: (text: string) => void;
}) {
  const suggestions = useMemo(
    () => (agentMessage ? suggestReplies(agentMessage, language) : []),
    [agentMessage, language]
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="border-t border-ink-100 bg-white/95 backdrop-blur px-3 pt-2 pb-1">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-1.5">
        Quick reply
      </div>
      <div className="flex gap-1.5 overflow-x-auto scroll-thin pb-1 -mx-1 px-1">
        {suggestions.map((s, idx) => (
          <button
            key={`${s}-${idx}`}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              'chip-pop shrink-0 rounded-full bg-brand-50 border border-brand-200 text-brand-700',
              'px-3.5 py-1.5 text-xs font-medium hover:bg-brand-100 active:scale-[0.97] transition-transform'
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
