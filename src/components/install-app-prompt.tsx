import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/lib/pwa";

/**
 * Invites a shopper to add this store to their phone's home screen.
 * Android/Chrome gets the native install prompt; iOS gets the Share > Add to Home Screen steps.
 */
export function InstallAppPrompt({
  storeName,
  accent = "#0b6e4f",
  storageKey,
}: {
  storeName: string;
  accent?: string;
  storageKey: string;
}) {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    setIsIos(ios);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let dismissedAt = 0;
    try {
      dismissedAt = Number(window.localStorage.getItem(storageKey) || 0);
    } catch {
      dismissedAt = 0;
    }
    // Re-offer after a week.
    if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;

    const t = window.setTimeout(() => setShow(true), 1500);
    return () => window.clearTimeout(t);
  }, [storageKey]);

  const dismiss = () => {
    setShow(false);
    setShowIosSteps(false);
    try {
      window.localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  if (installed || !show || (!canInstall && !isIos)) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px] sm:inset-auto sm:right-4 sm:bottom-4 sm:block sm:w-96 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-4 shadow-elevated sm:max-w-none">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: accent }}
          >
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 pr-5">
            <div className="text-sm font-semibold">Add {storeName} to your home screen</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Open the shop with one tap, like a normal app — no app store needed.
            </p>
          </div>
        </div>

        {showIosSteps ? (
          <ol className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <Share className="h-4 w-4" /> 1. Tap the Share button in Safari
            </li>
            <li className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> 2. Choose “Add to Home Screen”
            </li>
            <li className="flex items-center gap-2">
              <Download className="h-4 w-4" /> 3. Tap “Add” — the shop icon appears on your screen
            </li>
          </ol>
        ) : null}

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1 text-white"
            style={{ backgroundColor: accent }}
            onClick={async () => {
              if (canInstall) {
                const ok = await promptInstall();
                if (ok) dismiss();
                return;
              }
              setShowIosSteps(true);
            }}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {canInstall ? "Install shop" : "How to add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
