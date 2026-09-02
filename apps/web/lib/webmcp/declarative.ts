'use client';

/**
 * Bridge between a declarative WebMCP form and a React submit handler.
 *
 * The declarative API asks a page to call `preventDefault()` and then
 * `respondWith(promise)` during the submit event, so the agent gets the
 * outcome. That does not work from React's `onSubmit`, and the reason is
 * ordering rather than anything React does wrong:
 *
 *   1. The runtime listens for `submit` on `document` in the CAPTURE phase, so
 *      it sees the event first.
 *   2. It queues a microtask to settle the pending tool call.
 *   3. Microtasks drain between event listeners, so that microtask runs before
 *      the event has even reached the form — long before React's delegated
 *      handler at the root container.
 *   4. By then no response has been registered, so the call resolves with
 *      `undefined` and the agent learns nothing.
 *
 * So this registers its own `document` capture listener BEFORE the runtime is
 * installed. Listeners on the same target and phase fire in registration
 * order, which puts this one ahead of the runtime's, early enough for
 * `respondWith` to be honoured.
 */

interface AgentSubmitEvent extends SubmitEvent {
  agentInvoked?: boolean;
  respondWith?: (result: Promise<unknown>) => void;
}

type FormHandler = (form: HTMLFormElement) => Promise<string>;

const handlers = new WeakMap<HTMLFormElement, FormHandler>();
let installed = false;

/** Must be called before the WebMCP runtime installs its own listener. */
export function installDeclarativeSubmitBridge(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const handler = handlers.get(form);
      if (!handler) return;

      const ev = event as AgentSubmitEvent;
      // respondWith() is only legal once the default has been prevented.
      event.preventDefault();

      const result = handler(form);
      result.catch(() => {});

      if (ev.agentInvoked && typeof ev.respondWith === 'function') {
        try {
          ev.respondWith(result);
        } catch (err) {
          console.warn('[webmcp] respondWith rejected', err);
        }
      }
    },
    true
  );
}

/** Wire a form's submit logic in. Returns an unregister function. */
export function registerFormHandler(
  form: HTMLFormElement,
  handler: FormHandler
): () => void {
  handlers.set(form, handler);
  return () => handlers.delete(form);
}

/**
 * Subscribe to the runtime telling the page an agent has filled a form in.
 *
 * The event is dispatched on `window`, not on the form — listening on the form
 * silently never fires.
 */
export function onToolActivated(
  callback: (toolName: string | undefined) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => callback((e as Event & { toolName?: string }).toolName);
  window.addEventListener('toolactivated', listener);
  return () => window.removeEventListener('toolactivated', listener);
}
