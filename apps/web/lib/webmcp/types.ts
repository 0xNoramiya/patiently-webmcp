/**
 * WebMCP types.
 *
 * Mirrors the shape in the WebMCP explainer
 * (https://github.com/webmachinelearning/webmcp). Declared locally rather than
 * imported so the app builds and type-checks on toolchains that don't yet ship
 * WebMCP lib definitions.
 */

/** A single block of tool output handed back to the agent. */
export interface ToolContentBlock {
  type: 'text';
  text: string;
}

/** What `execute` resolves to once normalized. */
export interface ToolResult {
  content: ToolContentBlock[];
  isError?: boolean;
}

/**
 * Behavioural hints the agent (and the browser's own UI) can act on.
 *
 * `untrustedContentHint` is the one that carries weight in a clinical app: it
 * marks output that contains text a *patient* typed, which must never be read
 * by the agent as instructions. See lib/webmcp/runtime.ts `wrapUntrusted`.
 */
export interface ToolAnnotations {
  /** Tool only reads state; safe to call speculatively. */
  readOnlyHint?: boolean;
  /** Output embeds text authored by someone other than the current user. */
  untrustedContentHint?: boolean;
  /** Repeat calls with the same input have no additional effect. */
  idempotentHint?: boolean;
  /** Tool can affect things outside this page (network, other people). */
  openWorldHint?: boolean;
}

export interface ToolExecuteContext {
  signal?: AbortSignal;
}

export type ToolExecuteResult =
  | string
  | ToolResult
  | Record<string, unknown>
  | void;

export interface ToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  annotations?: ToolAnnotations;
  execute: (
    input: TInput,
    context: ToolExecuteContext
  ) => Promise<ToolExecuteResult> | ToolExecuteResult;
}

export interface RegisterToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

/** The `modelContext` surface this app relies on. */
export interface ModelContext {
  registerTool(
    tool: ToolDefinition<never>,
    options?: RegisterToolOptions
  ): Promise<void> | void;
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<unknown[]>;
  executeTool?: (
    tool: string,
    args: unknown,
    options?: { signal?: AbortSignal }
  ) => Promise<ToolResult>;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}
