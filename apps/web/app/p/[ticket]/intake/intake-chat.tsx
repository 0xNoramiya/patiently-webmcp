'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import { INTAKE_UPDATED_EVENT } from '../webmcp-patient-tools';
import type { IntakeMessage, IntakeSession, TicketDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ExtractedChips } from './extracted-chips';
import {
  IntakeOnboarding,
  shouldShowOnboarding,
} from './intake-onboarding';
import { PhotoAttach } from './photo-attach';
import { QuickReplies } from './quick-replies';
import { VoiceButton } from './voice-button';

interface Props {
  ticket: TicketDetail;
  poliLabel: string;
}

export function IntakeChat({ ticket, poliLabel }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Only true until the patient has dismissed the onboarding once on this
  // device. We start as null to avoid an SSR mismatch and resolve in an
  // effect after mount.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    setShowOnboarding(shouldShowOnboarding());
  }, []);

  useEffect(() => {
    let mounted = true;
    api
      .startIntake(ticket.id)
      .then((s) => {
        if (!mounted) return;
        setSession(s);
        setStarting(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Could not start the intake session');
        setStarting(false);
      });
    return () => {
      mounted = false;
    };
  }, [ticket.id]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [session?.messages.length, sending]);

  // An agent can drive intake through the WebMCP `describe_symptoms` tool.
  // When it does, the patient is often still looking at this screen — so pull
  // the session immediately rather than waiting for the next poll.
  useEffect(() => {
    const onAgentWrite = () => {
      api.getSession(ticket.id).then(setSession).catch(() => {});
    };
    window.addEventListener(INTAKE_UPDATED_EVENT, onAgentWrite);
    return () => window.removeEventListener(INTAKE_UPDATED_EVENT, onAgentWrite);
  }, [ticket.id]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !session || sending) return;
    setInput('');
    setSending(true);
    setError(null);

    const optimistic: IntakeMessage = {
      id: `optim-${Date.now()}`,
      role: 'patient',
      content: text,
      created_at: new Date().toISOString(),
    };
    setSession((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev
    );

    try {
      await api.sendMessage(ticket.id, text);
      const fresh = await api.getSession(ticket.id);
      setSession(fresh);
      if (fresh.status === 'completed') {
        setTimeout(() => router.push(`/p/${ticket.id}`), 1500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send your message');
    } finally {
      setSending(false);
    }
  }

  async function handleForceComplete() {
    if (!session) return;
    setSending(true);
    try {
      const fresh = await api.completeIntake(ticket.id);
      setSession(fresh);
      setTimeout(() => router.push(`/p/${ticket.id}`), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish the session');
    } finally {
      setSending(false);
    }
  }

  const visibleMessages = (session?.messages || []).filter(
    (m) => m.role !== 'system'
  );
  const completed = session?.status === 'completed';
  const triageFired = (session?.triage_flags || []).length > 0;

  if (showOnboarding) {
    const lang: 'en' | 'id' = session?.language === 'id' ? 'id' : 'en';
    return (
      <IntakeOnboarding
        language={lang}
        onDismiss={() => setShowOnboarding(false)}
      />
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-5 pt-5 pb-3 border-b border-ink-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            href={`/p/${ticket.id}`}
            className="text-sm text-ink-500 hover:text-ink-700"
          >
            ← Back to queue
          </Link>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <div className="text-ink-500">
            {poliLabel} · {ticket.patient.name}
          </div>
          <span className="pill-ink">{ticket.ticket_number}</span>
        </div>
        {triageFired && (
          <div className="mt-3 text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-xl px-3 py-2">
            The clinical team has been notified. You'll be prioritized.
          </div>
        )}
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-5 space-y-3 scroll-thin"
      >
        {starting && <TypingBubble label="Setting up the conversation" />}

        {visibleMessages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}

        {sending && !completed && <TypingBubble />}

        {completed && (
          <div className="card-padded bg-brand-50 border-brand-100 text-center mt-4">
            <div className="text-3xl">✓</div>
            <div className="font-display font-semibold text-ink-900 mt-1">
              Thanks, that's all we need
            </div>
            <p className="text-sm text-ink-500 mt-1">
              Your doctor will read the summary in a moment. You can return to the queue screen.
            </p>
          </div>
        )}

        {error && (
          <div className="text-sm text-alert-700 bg-alert-50 border border-alert-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {!completed && (
        <div className="sticky bottom-0">
          {session?.structured_data && Object.keys(session.structured_data).length > 0 && (
            <ExtractedChips
              data={session.structured_data}
              isFollowup={ticket.is_followup}
            />
          )}
          {!sending && (() => {
            const lastAgent = [...(visibleMessages || [])]
              .reverse()
              .find((m) => m.role === 'agent');
            const lang: 'en' | 'id' = session?.language === 'id' ? 'id' : 'en';
            return (
              <QuickReplies
                agentMessage={lastAgent?.content}
                language={lang}
                onPick={(text) => {
                  setInput((cur) =>
                    cur.trim().length === 0
                      ? text
                      : `${cur.trim()} ${text}`.trim()
                  );
                }}
              />
            );
          })()}
          <div className="relative px-4 py-3 border-t border-ink-100 bg-white">
            <div className="flex items-end gap-2">
              <PhotoAttach
                ticketId={ticket.id}
                disabled={sending || starting}
                onError={(msg) => setError(msg)}
              />
              <VoiceButton
                ticketId={ticket.id}
                disabled={sending || starting}
                onTranscript={(text) => {
                  setInput((current) =>
                    current.trim().length === 0
                      ? text
                      : `${current.trim()} ${text}`.trim()
                  );
                  setError(null);
                }}
                onError={(msg) => setError(msg)}
              />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type or tap the mic to speak..."
                rows={1}
                disabled={sending || starting}
                className="flex-1 resize-none rounded-2xl border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none px-4 py-3 text-base"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending || starting}
                className="btn-primary px-5 py-3 shrink-0"
                aria-label="Send"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3.4 20.4 22 12 3.4 3.6l.7 6.4L17 12l-12.9 2 -.7 6.4z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-ink-400">
                Enter to send · Shift+Enter for a new line
              </span>
              <button
                onClick={handleForceComplete}
                disabled={sending || starting}
                className="text-xs text-ink-500 hover:text-ink-700 underline"
              >
                I'm done
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ChatBubble({ message }: { message: IntakeMessage }) {
  const isAgent = message.role === 'agent';
  return (
    <div className={cn('flex gap-2', isAgent ? 'justify-start' : 'justify-end')}>
      {isAgent && (
        <div className="w-8 h-8 rounded-full bg-brand-600 grid place-items-center text-white text-xs font-bold shrink-0 mt-1">
          P
        </div>
      )}
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap',
          isAgent
            ? 'bg-white border border-ink-100 text-ink-900 shadow-soft rounded-tl-md'
            : 'bg-brand-600 text-white rounded-tr-md'
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

function TypingBubble({ label }: { label?: string }) {
  return (
    <div className="flex gap-2 justify-start">
      <div className="w-8 h-8 rounded-full bg-brand-600 grid place-items-center text-white text-xs font-bold shrink-0 mt-1">
        P
      </div>
      <div className="bg-white border border-ink-100 text-ink-500 shadow-soft rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5 text-sm">
        {label ? (
          <span>{label}</span>
        ) : (
          <>
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-400" style={{ animationDelay: '0s' }} />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-400" style={{ animationDelay: '0.15s' }} />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-400" style={{ animationDelay: '0.3s' }} />
          </>
        )}
      </div>
    </div>
  );
}
