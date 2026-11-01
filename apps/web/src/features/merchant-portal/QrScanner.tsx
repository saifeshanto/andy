import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

/**
 * Reads QR codes from the phone camera in the browser (no app needed). Uses the back camera when there is one.
 * Needs HTTPS in production, which the live site has.
 */
export function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const stop = () => {
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    const tick = () => {
      const v = video.current;
      const c = canvas.current;
      if (v && c && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 640 / v.videoWidth);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const found = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
          if (found?.data && !done.current) {
            done.current = true;
            navigator.vibrate?.(80);
            stop();
            onCode(found.data);
            return;
          }
        }
      }
      timer = window.setTimeout(tick, 200);
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera. Type the code instead.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        tick();
      })
      .catch(() => setError('Camera not available. Allow camera access in your browser settings, or type the code instead.'));
    return stop;
  }, [onCode]);

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="warning">{error}</Alert>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-card bg-ink-950">
          <video ref={video} playsInline muted className="size-full object-cover" aria-label="Camera view" />
          <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-4 border-white/80" aria-hidden />
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white drop-shadow">Point at the member’s QR code</p>
        </div>
      )}
      <canvas ref={canvas} className="hidden" />
      <Button variant="secondary" className="w-full" onClick={onClose}>Close camera</Button>
    </div>
  );
}
