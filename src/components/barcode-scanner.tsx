import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
};

/** Camera barcode scanner. ZXing is loaded lazily so it never runs during SSR. */
export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (!result || cancelled) return;
            const text = result.getText().trim();
            if (!text) return;
            cancelled = true;
            stopRef.current?.();
            onDetected(text);
            onOpenChange(false);
          },
        );
        if (cancelled) { controls.stop(); return; }
        stopRef.current = () => controls.stop();
      } catch (e) {
        setError((e as Error).message || "Could not start the camera");
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-4 w-4" />Scan barcode</DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="space-y-3 text-sm">
            <p className="text-destructive">{error}</p>
            <p className="text-muted-foreground">Allow camera access in your browser, then try again.</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
            </div>
            <p className="text-center text-xs text-muted-foreground">Hold the barcode inside the frame.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
