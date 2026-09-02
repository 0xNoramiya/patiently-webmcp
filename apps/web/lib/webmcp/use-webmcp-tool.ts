'use client';

/**
 * React binding for WebMCP tool registration.
 *
 * Ties a tool's lifetime to a component's: registered on mount, aborted on
 * unmount. That is what gives Patiently a *dynamic* tool surface — the clinician
 * tools exist only while the dashboard is mounted, and per-patient tools appear
 * and disappear as the selected ticket changes, so the agent is never offered a
 * tool that cannot currently work.
 *
 * Every call is also threaded through the agent-session log, so the human sees
 * the agent working in real time rather than after the fact.
 */
import { useEffect } from 'react';

import { useAgentSession } from './agent-session';
import { isWebMCPSupported, registerTool } from './runtime';
import type { ToolDefinition } from './types';

export interface AppToolDefinition<TInput = Record<string, unknown>>
  extends ToolDefinition<TInput> {
  /** Log line shown in the activity panel, derived from the call's input. */
  label?: (input: TInput) => string;
}

/**
 * Register a list of tools for as long as the calling component is mounted.
 *
 * `deps` controls re-registration. Tools close over component state, so the
 * dependency list must include anything the `execute` bodies read — same
 * contract as `useEffect`, deliberately, so it is hard to get subtly wrong.
 */
export function useWebMCPTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: AppToolDefinition<any>[],
  deps: unknown[]
): void {
  const { beginCall, endCall, setSupported, setToolCount } = useAgentSession();

  useEffect(() => {
    const supported = isWebMCPSupported();
    setSupported(supported);
    if (!supported) {
      setToolCount(0);
      return;
    }

    const controller = new AbortController();

    const cleanups = tools.map((tool) =>
      registerTool(
        {
          ...tool,
          execute: async (input, context) => {
            const label = tool.label?.(input) ?? tool.name.replace(/_/g, ' ');
            const callId = beginCall(tool.name, label);
            try {
              const result = await tool.execute(input, context ?? {});
              const declined =
                typeof result === 'string' && /declined|cancell?ed/i.test(result);
              endCall(callId, declined ? 'declined' : 'ok');
              return result;
            } catch (err) {
              endCall(
                callId,
                'error',
                err instanceof Error ? err.message : String(err)
              );
              throw err;
            }
          },
        },
        { signal: controller.signal }
      )
    );

    setToolCount(tools.length);

    return () => {
      controller.abort();
      cleanups.forEach((fn) => fn());
      setToolCount(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
