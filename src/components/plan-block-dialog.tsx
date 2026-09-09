import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MARKER = "__planBlock";
const EVENT = "plan-block";

/** Error thrown when an action is not allowed on the current plan. */
export function planBlockError(reason: string) {
  const e = new Error(reason) as Error & { [MARKER]?: true };
  e[MARKER] = true;
  return e;
}

export function isPlanBlockError(e: unknown): e is Error {
  return !!e && typeof e === "object" && (e as Record<string, unknown>)[MARKER] === true;
}

/**
 * If the error is a plan block, show the centred dialog and report true so the
 * caller can skip its normal toast.
 */
export function handlePlanBlockError(e: unknown): boolean {
  if (!isPlanBlockError(e)) return false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: e.message }));
  }
  return true;
}

/** Mounted once in the app shell; shows any plan block message in the centre. */
export function PlanBlockDialogHost() {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const onBlock = (e: Event) => setReason((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onBlock);
    return () => window.removeEventListener(EVENT, onBlock);
  }, []);

  const expired = (reason ?? "").toLowerCase().includes("expired");

  return (
    <Dialog open={!!reason} onOpenChange={(o) => !o && setReason(null)}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-amber-500/15 via-transparent to-transparent px-6 pt-7 pb-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold">
            {expired ? "Your plan has expired" : "You've reached your plan limit"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{reason}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-center">
          <Button variant="ghost" onClick={() => setReason(null)}>
            Not now
          </Button>
          <Button asChild className="gradient-emerald text-white">
            <Link to="/billing" onClick={() => setReason(null)}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Renew plan
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
