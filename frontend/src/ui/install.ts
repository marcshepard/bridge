// Installing the app to the home screen (it's a PWA: see public/manifest.webmanifest).
//
// Chrome and Edge (Android, and computers) announce that the app can be installed with a
// `beforeinstallprompt` event, which we keep so a button can show the browser's own install prompt.
// iPhones and iPads have no such event: installing is always Share → Add to Home Screen, so we can
// only explain how. A web page can't open the installed app for you; once installed, it's opened
// from the home screen (Chrome on Android also offers "Open" itself).

import { useEffect, useReducer } from "react";
import { devMode } from "../services";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Registered as soon as this module loads: the event can fire before React has rendered anything.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // we show our own banner instead of the browser's mini info bar
  deferredPrompt = e as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  installedThisVisit = true;
  deferredPrompt = null;
  notify();
});

/** Running as the installed app (from the home screen), not in a browser tab. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** A phone or tablet: a touch screen is the main way to point. */
function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

export type Platform = "ios" | "android" | "other";

function platformOf(ua: string): Platform {
  // iPadOS reports itself as a Mac, but with a touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function useInstall() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  return {
    /**
     * Worth suggesting: on a phone or tablet (or any device in dev builds, so it can be tried on a
     * computer), in a browser tab rather than the installed app.
     */
    suggest: (isTouchDevice() || devMode) && !isStandalone() && !installedThisVisit,
    /** Not installed yet (in a browser tab), on any device: the avatar menu offers to install. */
    canInstall: !isStandalone() && !installedThisVisit,
    /** A phone or tablet: the banner stays until installed (or "Not now"); on a computer it can be closed. */
    touch: isTouchDevice(),
    /** The browser offered its install prompt, so one tap installs. */
    canPrompt: deferredPrompt !== null,
    installed: installedThisVisit,
    platform: platformOf(navigator.userAgent),
    /** Shows the browser's install prompt. Resolves true if the person installed it. */
    async prompt(): Promise<boolean> {
      const p = deferredPrompt;
      if (!p) return false;
      await p.prompt();
      const { outcome } = await p.userChoice;
      deferredPrompt = null;
      notify();
      return outcome === "accepted";
    },
  };
}
