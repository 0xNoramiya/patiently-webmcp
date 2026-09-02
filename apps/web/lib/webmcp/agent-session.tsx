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

/**
 * How an approval ended.
 *
 * This is not a boolean because three of the four outcomes are not a human
 * decision, and reporting them as one would put words in the clinician's
 * mouth — an agent telling a doctor "you declined recording those vitals" when
 * no dialog was ever answered is worse than no answer at all.
 */
export type ApprovalOutcome = 'approved' | 'declined' | 'expired' | 'cancelled';

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

  /** The proposal currently on screen. */
  pending: ApprovalRequest | null;
  /** How many further proposals are queued behind it. */
  queuedBehind: number;
  requestApproval: (
    req: Omit<ApprovalRequest, 'id'>,
    signal?: AbortSignal
  ) => Promise<ApprovalOutcome>;
  resolvePending: (approved: boolean) => void;
}

interface QueuedApproval {
  request: ApprovalRequest;
  resolve: (outcome: ApprovalOutcome) => void;
  /** Set when the proposal reaches the front and becomes visible. */
  timer: ReturnType<typeof setTimeout> | undefined;
}

const AgentSessionContext = createContext<AgentSessionValue | null>(null);

/** A visible proposal expires so a forgotten dialog can't wedge the agent. */
const APPROVAL_TIMEOUT_MS = 180_000;

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState(false);
  const [toolCount, setToolCount] = useState(0);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [pending, setPending] = useState<ApprovalRequest | null>(null);
  const [queuedBehind, setQueuedBehind] = useState(0);

  /**
   * Proposals waiting on a human, oldest first.
   *
   * This used to be a single slot, and a second proposal arriving while one was
   * on screen silently resolved the first as "declined" — so an agent could be
   * told the clinician refused something the clinician never saw. They queue
   * now: every proposal an agent makes gets a real human decision, or is
   * honestly reported as never having received one.
   */
  const queueRef = useRef<QueuedApproval[]>([]);

  const sync = useCallback(() => {
    const head = queueRef.current[0] ?? null;
    setPending(head ? head.request : null);
    setQueuedBehind(Math.max(0, queueRef.current.length - 1));

    // The clock only starts once a proposal is actually in front of someone.
    if (head && head.timer === undefined) {
      head.timer = setTimeout(() => settleRef.current(head, 'expired'), APPROVAL_TIMEOUT_MS);
    }
  }, []);

  const settle = useCallback(
    (entry: QueuedApproval, outcome: ApprovalOutcome) => {
      const index = queueRef.current.indexOf(entry);
      if (index === -1) return;
      queueRef.current.splice(index, 1);
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      entry.resolve(outcome);
      sync();
    },
    [sync]
  );

  // `sync` schedules a timeout that calls `settle`, and `settle` calls `sync`.
  // A ref breaks the cycle without making either depend on the other.
  const settleRef = useRef(settle);
  settleRef.current = settle;

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

  const requestApproval = useCallback(
    (req: Omit<ApprovalRequest, 'id'>, signal?: AbortSignal) =>
      new Promise<ApprovalOutcome>((resolve) => {
        if (signal?.aborted) {
          resolve('cancelled');
          return;
        }

        const entry: QueuedApproval = {
          request: { ...req, id: nextId() },
          resolve,
          timer: undefined,
        };
        queueRef.current.push(entry);

        signal?.addEventListener(
          'abort',
          () => settleRef.current(entry, 'cancelled'),
          { once: true }
        );

        sync();
      }),
    [sync]
  );

  /** Answer whatever is on screen. */
  const resolvePending = useCallback(
    (approved: boolean) => {
      const head = queueRef.current[0];
      if (head) settleRef.current(head, approved ? 'approved' : 'declined');
    },
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
      queuedBehind,
      requestApproval,
      resolvePending,
    }),
    [
      supported, toolCount, events, beginCall, endCall,
      pending, queuedBehind, requestApproval, resolvePending,
    ]
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

/**
 * Turn a non-approval into an honest sentence for the agent.
 *
 * Only `declined` is a decision someone made. Saying "the clinician declined"
 * when a proposal expired unseen, or was cancelled before it reached the front
 * of the queue, attributes a clinical judgement to a person who never made one.
 */
export function describeNonApproval(
  outcome: Exclude<ApprovalOutcome, 'approved'>,
  consequence: string,
  who: 'clinician' | 'patient' = 'clinician'
): string {
  switch (outcome) {
    case 'declined':
      return `The ${who} declined — ${consequence}`;
    case 'expired':
      return `No answer from the ${who} within three minutes, so this was not confirmed — ${consequence} Nobody rejected it; ask them to look again.`;
    case 'cancelled':
      return `The request was withdrawn before the ${who} answered — ${consequence} They never saw it.`;
  }
}
