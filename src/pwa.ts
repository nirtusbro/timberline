import { registerSW } from "virtual:pwa-register";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const standalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;
const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Makes installing discoverable. Chrome and Edge only show their own banner
 * after enough visits, so the install prompt they offer is captured and put
 * behind a button on the menu instead. Safari has no prompt at all, so on an
 * iPhone or iPad the button becomes a hint for Share → Add to Home Screen.
 * Both disappear once the game runs from the home screen.
 */
export function setupInstall(button: HTMLButtonElement, hint: HTMLElement) {
  if (standalone()) return;
  let deferred: BeforeInstallPromptEvent | null = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    button.hidden = false;
    hint.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    button.hidden = true;
    hint.hidden = true;
  });
  button.addEventListener("click", async () => {
    if (!deferred) return;
    button.disabled = true;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    button.disabled = false;
    if (outcome === "accepted") button.hidden = true;
  });
  if (isIos()) hint.hidden = false;
}

const CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * Registers the offline service worker. A new build is never applied
 * mid-run: the given button appears on the menu and the player chooses
 * when to restart into the fresh version.
 */
export function setupPwa(updateButton: HTMLButtonElement) {
  if (!("serviceWorker" in navigator)) return;
  const applyUpdate = registerSW({
    onNeedRefresh() {
      updateButton.hidden = false;
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {});
      };
      setInterval(check, CHECK_INTERVAL);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) check();
      });
    },
    onRegisterError(error) {
      console.warn("Service worker registration failed", error);
    },
  });
  updateButton.addEventListener("click", () => {
    updateButton.disabled = true;
    updateButton.textContent = "Restarting…";
    void applyUpdate(true);
  });
}
