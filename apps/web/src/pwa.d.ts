/** Registration helper emitted by vite-plugin-pwa. */
declare module 'virtual:pwa-register' {
  /**
   * Registers the service worker.
   *
   * @param options - When `immediate` is set, registration starts at once.
   * @returns A function that asks the waiting worker to take control.
   */
  export function registerSW(options?: { immediate?: boolean }): (reloadPage?: boolean) => Promise<void>;
}
