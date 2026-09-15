import { nextTick } from "vue";

type StartViewTransition = (update: () => void | Promise<void>) => unknown;

/**
 * Same-document View Transitions helper (platform API, no router in this app).
 *
 * - Feature-detects document.startViewTransition, and hard-disables on Linux:
 *   WebKitGTK exposes the API but hangs the webview on the legacy rendering
 *   path forced by WEBKIT_DISABLE_DMABUF_RENDERER (NVIDIA/VM fix in main.rs).
 *   Windows (WebView2/Chromium) and macOS (WKWebView >= Safari 18) animate;
 *   everywhere else updates apply immediately. Never polyfills.
 * - The update callback mutates reactive state; nextTick() lets Vue patch the
 *   DOM before the new snapshot is captured.
 * - Keep IPC/network OUTSIDE this call: only DOM-affecting mutations go inside
 *   (fetch before the transition, mutate inside).
 */
export async function withViewTransition(update: () => void | Promise<void>): Promise<void> {
  const start = (
    document as Document & { startViewTransition?: StartViewTransition }
  ).startViewTransition;
  if (typeof start !== "function" || navigator.userAgent.includes("Linux")) {
    await update();
    return;
  }
  const transition = start.call(document, async () => {
    await update();
    await nextTick();
  });
  // Resolves even when the transition is skipped; rejects if update throws.
  await (transition as { finished?: Promise<void> }).finished;
}
