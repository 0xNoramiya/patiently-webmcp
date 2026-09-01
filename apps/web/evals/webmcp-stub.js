/**
 * Minimal `document.modelContext` stub.
 *
 * Injected before any page script runs, so the app's registration path is
 * exercised exactly as it would be in ChatGPT's in-app browser or Chrome with
 * the WebMCP flag on. Tools land in `window.__webmcpTools`, and the harness
 * calls them the way an agent would.
 *
 * This is a test double for the *browser*, not for Patiently — every tool body,
 * every fetch, and every approval gate is the real one.
 */
window.__webmcpStub = () => {
  const tools = new Map();

  const modelContext = {
    registerTool(tool, options = {}) {
      tools.set(tool.name, tool);
      if (options.signal) {
        options.signal.addEventListener('abort', () => tools.delete(tool.name), {
          once: true,
        });
      }
      return Promise.resolve();
    },
    getTools() {
      return Promise.resolve(
        [...tools.values()].map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        }))
      );
    },
    executeTool(name, args, options = {}) {
      const tool = tools.get(name);
      if (!tool) return Promise.reject(new Error(`no such tool: ${name}`));
      return Promise.resolve(tool.execute(args ?? {}, { signal: options.signal }));
    },
    addEventListener() {},
    removeEventListener() {},
  };

  Object.defineProperty(document, 'modelContext', {
    value: modelContext,
    configurable: true,
  });

  window.__webmcpTools = tools;
};
window.__webmcpStub();
