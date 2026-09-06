import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
};

type AudioCtor = typeof AudioContext;

/** One shared audio context, unlocked by the tap that opens the scanner. */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const Ctx: AudioCtor | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx || audioCtx.state === "closed") audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Called from a user gesture so mobile browsers allow sound later. */
function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

/** Short confirmation tone so the user hears a successful scan. */
function beep() {
  const ctx = getCtx();
  if (ctx) {
    const play = () => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 1250;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } catch {
        /* ignore */
      }
    };
    if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
    else play();
  }
  try {
    navigator.vibrate?.([60]);
  } catch {
    /* vibration is a nicety */
  }
}


/** Camera barcode scanner. ZXing is loaded lazily so it never runs during SSR. */
export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    // The scan button tap is a user gesture — unlock audio in the same task so the beep plays later.
    unlockAudio();

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, zxing] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const { DecodeHintType, BarcodeFormat } = zxing;
        // Limit formats and scan continuously with almost no delay so reads are instant.
        const hints = new Map<number, unknown>([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
              BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
            ],
          ],
          [DecodeHintType.TRY_HARDER, false],
        ]);
        const reader = new BrowserMultiFormatReader(hints as never, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 40,
        });
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current!,
          (result) => {
            if (!result || cancelled) return;
            const text = result.getText().trim();
            if (!text) return;
            cancelled = true;
            beep();
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
