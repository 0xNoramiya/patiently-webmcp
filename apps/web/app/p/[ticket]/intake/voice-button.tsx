'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type Phase = 'idle' | 'recording' | 'uploading' | 'unsupported' | 'denied';

interface Props {
  ticketId: string;
  /** Called with the transcribed text once speech-to-text returns it. */
  onTranscript: (text: string) => void;
  /** Surface an error message if the round-trip fails. */
  onError?: (message: string) => void;
  disabled?: boolean;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function VoiceButton({ ticketId, onTranscript, onError, disabled }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasMediaDevices =
      'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
    const hasRecorder = typeof MediaRecorder !== 'undefined';
    if (!hasMediaDevices || !hasRecorder) {
      setPhase('unsupported');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleStop;
      recorder.start();
      setPhase('recording');
      setElapsed(0);
      tickRef.current = setInterval(() => {
        setElapsed((s) => s + 1);
      }, 1000);
    } catch (e) {
      if ((e as DOMException).name === 'NotAllowedError') {
        setPhase('denied');
      } else {
        setPhase('idle');
        onError?.(e instanceof Error ? e.message : 'Microphone unavailable');
      }
    }
  }

  function stopRecording() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  async function handleStop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const blob = new Blob(chunksRef.current, {
      type: chunksRef.current[0]?.type || 'audio/webm',
    });
    chunksRef.current = [];
    if (blob.size < 200) {
      setPhase('idle');
      onError?.('Recording was too short. Hold the button while you speak.');
      return;
    }
    setPhase('uploading');
    try {
      const fd = new FormData();
      const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
      fd.append('audio', blob, `voice.${ext}`);
      const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
      const res = await fetch(`${base}/api/intake/${ticketId}/voice`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`API ${res.status}: ${txt || res.statusText}`);
      }
      const data = (await res.json()) as { transcript: string };
      const transcript = (data.transcript || '').trim();
      if (!transcript) {
        onError?.("Couldn't catch that. Try again, a little closer to the mic.");
      } else {
        onTranscript(transcript);
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Voice upload failed');
    } finally {
      setPhase('idle');
      setElapsed(0);
    }
  }

  if (phase === 'unsupported') return null;

  const isBusy = phase === 'recording' || phase === 'uploading';

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        if (phase === 'recording') stopRecording();
        else if (phase === 'idle') startRecording();
      }}
      disabled={disabled || phase === 'uploading' || phase === 'denied'}
      aria-pressed={phase === 'recording'}
      aria-label={
        phase === 'recording'
          ? 'Stop recording and send for transcription'
          : 'Record your reply with your voice'
      }
      className={cn(
        'shrink-0 rounded-full w-12 h-12 grid place-items-center transition-all border shadow-soft',
        phase === 'recording' &&
          'bg-alert-600 border-alert-700 text-white scale-110 alert-pulse',
        phase === 'uploading' &&
          'bg-brand-600 border-brand-700 text-white',
        phase === 'idle' &&
          'bg-white border-ink-200 text-brand-700 hover:bg-brand-50',
        phase === 'denied' &&
          'bg-ink-100 border-ink-200 text-ink-400 cursor-not-allowed'
      )}
      title={
        phase === 'denied'
          ? 'Microphone permission was denied — allow it in the browser settings to use voice input'
          : phase === 'recording'
            ? `Recording · ${elapsed}s — tap to stop`
            : 'Speak instead of typing'
      }
    >
      {phase === 'uploading' ? (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          className="animate-spin"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
          <path d="M12 3 a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect
            x="9"
            y="3"
            width="6"
            height="12"
            rx="3"
            fill={isBusy ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M5 11a7 7 0 0 0 14 0M12 18v3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
