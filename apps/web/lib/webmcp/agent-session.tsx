'use client';

/**
 * Agent session: the shared surface between the human at the keyboard and the
 * agent driving the page.
 *
 * Two responsibilities, both of which exist to keep the human in charge:
 *
 *   Visibility — every tool call is logged and rendered live, so the clinician
 *   watches the agent work instead of discovering the result afterwards.
 *
 *   Consent — a tool that writes to the chart does not write. It files a
 *   proposal and awaits a click. `requestApproval` returns a promise that the
 *   UI resolves, so the agent's `execute` genuinely blocks on a human decision;
 *   the model cannot route around it, because the write only happens on the
 *   resolved branch.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type AgentEventStatus = 'running' | 'ok' | 'error' | 'declined';

export interface AgentEvent {
  id: string;
  tool: string;
  /** Short human-readable line, e.g. "Drafted SOAP note for A-014". */
  label: string;
  status: AgentEventStatus;
  detail?: string;
  at: number;
}

export interface ApprovalRequest {
  id: string;
  /** e.g. "Sign 2 prescriptions" */
  title: string;
  /** One line of context under the title. */
  summary: string;
  /** Optional itemised body — the actual content being committed. */
  lines?: string[];
  /** Renders the confirm button as destructive/high-stakes. */
  danger?: boolean;
  confirmLabel?: string;
}

interface AgentSessionValue {
  supported: boolean;
  setSupported: (v: boolean) => void;
  toolCount: number;
  setToolCount: (n: number) => void;

  events: AgentEvent[];
  beginCall: (tool: string, label: string) => string;
  endCall: (id: string, status: AgentEventStatus, detail?: string) => void;

  pending: ApprovalRequest | null;
  requestApproval: (
    req: Omit<ApprovalRequest, 'id'>,
    signal?: AbortSignal
  ) => Promise<boolean>;
  resolvePending: (approved: boolean) => void;
}

const AgentSessionContext = createContext<AgentSessionValue | null>(null);

/** Approval requests expire so a forgotten dialog can't wedge the agent. */
const APPROVAL_TIMEOUT_MS = 180_000;

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState(false);
  const [toolCount, setToolCount] = useState(0);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [pending, setPending] = useState<ApprovalRequest | null>(null);

  const resolverRef = useRef<((approved: boolean) => void) | null>(null);

  const beginCall = useCallback((tool: string, label: string) => {
    const id = nextId();
    setEvents((cur) => [
      ...cur.slice(-40),
      { id, tool, label, status: 'running', at: Date.now() },
    ]);
    return id;
  }, []);

  const endCall = useCallback(
    (id: string, status: AgentEventStatus, detail?: string) => {
      setEvents((cur) =>
        cur.map((e) => (e.id === id ? { ...e, status, detail } : e))
      );
    },
    []
  );

  const settle = useCallback((approved: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPending(null);
    resolve?.(approved);
  }, []);

  const requestApproval = useCallback(
    (req: Omit<ApprovalRequest, 'id'>, signal?: AbortSignal) =>
      new Promise<boolean>((resolve) => {
        // Only one decision is on screen at a time; a new request supersedes
        // an unanswered one, which is declined rather than left dangling.
        resolverRef.current?.(false);

        if (signal?.aborted) {
          resolve(false);
          return;
        }

        const id = nextId();
        let done = false;
        const finish = (approved: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(approved);
        };

        resolverRef.current = finish;
        setPending({ ...req, id });

        const timer = setTimeout(() => {
          if (done) return;
          resolverRef.current = null;
          setPending(null);
          finish(false);
        }, APPROVAL_TIMEOUT_MS);

        signal?.addEventListener(
          'abort',
          () => {
            if (done) return;
            resolverRef.current = null;
            setPending(null);
            finish(false);
          },
          { once: true }
        );
      }),
    []
  );

  const value = useMemo<AgentSessionValue>(
    () => ({
      supported,
      setSupported,
      toolCount,
      setToolCount,
      events,
      beginCall,
      endCall,
      pending,
      requestApproval,
      resolvePending: settle,
    }),
    [supported, toolCount, events, beginCall, endCall, pending, requestApproval, settle]
  );

  return (
    <AgentSessionContext.Provider value={value}>
      {children}
    </AgentSessionContext.Provider>
  );
}

export function useAgentSession(): AgentSessionValue {
  const ctx = useContext(AgentSessionContext);
  if (!ctx) {
    throw new Error('useAgentSession must be used inside <AgentSessionProvider>');
  }
  return ctx;
}
