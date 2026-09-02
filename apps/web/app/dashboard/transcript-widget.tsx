'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { ConsultationTranscriptOut } from '@/lib/types';
import { cn } from '@/lib/utils';

function audioUrl(audioPath: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || '';
  return `${base}${audioPath}`;
}

export function TranscriptWidget({
  ticketId,
  adminPassword,
}: {
  ticketId: string;
  adminPassword: string;
}) {
  const [transcript, setTranscript] = useState<ConsultationTranscriptOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const t = await api.getTranscript(ticketId, adminPassword);
      setTranscript(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transcript');
    }
  }, [ticketId, adminPassword]);

  useEffect(() => {
    setTranscript(null);
    setError(null);
    refresh().catch(() => {});
  }, [ticketId, refresh]);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const t = await api.generateTranscript(ticketId, adminPassword);
      setTranscript(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide">
            Consultation transcript
          </h3>
          <div className="text-[11px] text-ink-400 mt-0.5">
            Mock audio via OpenAI TTS · Transcribed by Speechmatics
          </div>
        </div>
        {(!transcript || transcript.status === 'failed') && (
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="btn-primary text-xs py-2 px-4"
          >
            {busy ? 'Transcribing…' : '▶ Play & transcribe'}
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {!transcript && !busy && !error && (
        <div className="text-xs text-ink-400 italic">
          Click <span className="font-semibold">Play & transcribe</span> to synthesize a
          mock doctor–patient conversation and run it through Speechmatics.
        </div>
      )}

      {busy && (
        <div className="text-sm text-ink-500 flex items-center gap-2">
          <span className="typing-dot w-2 h-2 rounded-full bg-brand-500" style={{ animationDelay: '0s' }} />
          <span className="typing-dot w-2 h-2 rounded-full bg-brand-500" style={{ animationDelay: '0.15s' }} />
          <span className="typing-dot w-2 h-2 rounded-full bg-brand-500" style={{ animationDelay: '0.3s' }} />
          <span>Synthesizing audio and transcribing…</span>
        </div>
      )}

      {transcript && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span
              className={cn(
                'pill',
                transcript.status === 'done' && 'bg-brand-100 text-brand-700',
                transcript.status === 'transcribing' && 'bg-warn-100 text-warn-600',
                transcript.status === 'failed' && 'bg-alert-100 text-alert-700'
              )}
            >
              {transcript.status}
            </span>
            {transcript.speechmatics_job_id && (
              <span className="text-ink-400 truncate ml-2">
                Speechmatics job · {transcript.speechmatics_job_id.slice(0, 12)}
              </span>
            )}
          </div>

          <audio
            controls
            src={audioUrl(transcript.audio_path)}
            className="w-full rounded-xl"
          />

          {transcript.transcript_text ? (
            <div className="text-sm text-ink-700 bg-white border border-ink-100 rounded-xl p-3 max-h-72 overflow-y-auto scroll-thin whitespace-pre-wrap">
              {transcript.transcript_text}
            </div>
          ) : transcript.status === 'failed' ? (
            <div className="text-sm text-alert-700 bg-alert-50 border border-alert-100 rounded-xl p-3">
              {transcript.error || 'Transcription failed'}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
