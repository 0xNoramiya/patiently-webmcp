/**
 * JSX typings for the Declarative WebMCP attributes.
 *
 * These are real HTML attributes the browser (or the polyfill) reads to derive
 * a tool from a form, but they are not in lib.dom or @types/react yet. Declared
 * here so the markup type-checks without casting the elements to `any` — the
 * point of the declarative API is that the form stays a normal form.
 *
 * See https://developer.chrome.com/docs/ai/webmcp/declarative-api
 */
import 'react';

declare module 'react' {
  interface FormHTMLAttributes<T> {
    /** Names the tool this form becomes. Required for the form to register. */
    toolname?: string;
    /** Human-readable title for the tool. */
    tooltitle?: string;
    /** What the tool does, and when an agent should reach for it. */
    tooldescription?: string;
    /**
     * Submit as soon as the agent has filled the form, with no human step.
     * Deliberately unused in this app: every form here commits something a
     * person is accountable for.
     */
    toolautosubmit?: boolean | '';
  }

  /** Field-level descriptions become the property descriptions in the schema. */
  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}

declare global {
  interface HTMLElementEventMap {
    /** An agent has filled this form in and is waiting on the human. */
    toolactivated: CustomEvent<{ toolName?: string }>;
    /** The agent's invocation was cancelled, or the form was reset. */
    toolcancel: CustomEvent<{ toolName?: string }>;
  }
}
