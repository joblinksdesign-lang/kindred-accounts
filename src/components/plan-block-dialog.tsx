import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MARKER = "__planBlock";

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
 * Centred, friendly message shown when the plan has expired or a limit is hit.
 */
export function PlanBlockDialog({
  reason,
  onClose,
}: {
  reason: string | null;
  onClose: () => void;
}) {
  const expired = (reason ?? "").toLowerCase().includes("expired");
  return (
    <Dialog open={!!reason} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-amber-500/15 via-transparent to-transparent px-6 pt-7 pb-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold">
            {expired ? "Your plan has expired" : "You've reached your plan limit"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{reason}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-center">
          <Button variant="ghost" onClick={onClose} className="sm:w-auto">
            Not now
          </Button>
          <Button asChild className="gradient-emerald text-white sm:w-auto">
            <Link to="/billing" onClick={onClose}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Renew plan
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience hook: keeps the reason in state and renders the dialog. */
export function usePlanBlockDialog(): {
  showBlock: (reason: string) => void;
  handleBlockError: (e: unknown) => boolean;
  dialog: ReactNode;
} {
  const [reason, setReason] = useState<string | null>(null);
  return {
    showBlock: setReason,
    handleBlockError: (e: unknown) => {
      if (isPlanBlockError(e)) {
        setReason(e.message);
        return true;
      }
      return false;
    },
    dialog: <PlanBlockDialog reason={reason} onClose={() => setReason(null)} />,
  };
}
