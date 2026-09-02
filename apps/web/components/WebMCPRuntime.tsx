'use client';

/**
 * Installs the WebMCP runtime on every page.
 *
 * Until now the runtime was only installed as a side effect of a page
 * registering imperative tools. That left the declarative surface broken: the
 * receptionist console has no imperative tools at all, so nothing triggered the
 * install, so its `toolname` form was never discovered by anything.
 *
 * Mounted from the root layout, at module scope, so `document.modelContext`
 * exists before any component's effect runs and before the polyfill's
 * MutationObserver needs to see the first render.
 */
import { installDeclarativeSubmitBridge } from '@/lib/webmcp/declarative';
import { ensureModelContext } from '@/lib/webmcp/runtime';

if (typeof window !== 'undefined') {
  // Order matters: the bridge must claim its document-capture submit
  // listener before the runtime registers its own, or `respondWith` is
  // already too late by the time the page sees the event.
  installDeclarativeSubmitBridge();
  ensureModelContext();
}

export function WebMCPRuntime() {
  return null;
}
