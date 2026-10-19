/**
 * Camera QR scanner (phone back camera or laptop webcam).
 * Uses the browser's built-in BarcodeDetector when available and falls back to jsQR.
 * Also supports scanning from a photo, for devices where the live camera is blocked.
 *
 * Note: browsers only allow the camera on https:// pages or on http://localhost.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, ImageUp, SwitchCamera } from 'lucide-react';

interface Props {
  onResult: (text: string) => void;
  /** Pause decoding (e.g. while a result is being processed). */
  paused?: boolean;
}

type DetectorLike = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

function createDetector(): DetectorLike | null {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => DetectorLike }).BarcodeDetector;
  try {
    return BD ? new BD({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

export const QrScanner: React.FC<Props> = ({ onResult, paused }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  pausedRef.current = paused;

  const emit = useCallback(
    (text: string) => {
      const now = Date.now();
      // Ignore the same code for 3 seconds so one card is not processed twice.
      if (text === lastRef.current.text && now - lastRef.current.at < 3000) return;
      lastRef.current = { text, at: now };
      navigator.vibrate?.(80);
      onResult(text);
    },
    [onResult]
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('The camera only works on https:// or http://localhost. Use "Scan from photo" or type the household number instead.');
      return;
    }
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setActive(true);
    } catch (err) {
      const name = (err as { name?: string }).name;
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings, then tap "Start camera" again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device. Use "Scan from photo" or type the household number.'
            : 'Could not open the camera. Close other apps using it and try again.'
      );
    }
  }, [facing, stop]);

  // Decode loop
  useEffect(() => {
    if (!active) return;
    const detector = createDetector();
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!pausedRef.current && video && canvas && video.readyState >= 2 && video.videoWidth) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) emit(codes[0].rawValue);
          } else {
            const w = Math.min(640, video.videoWidth);
            const h = Math.round((video.videoHeight / video.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
              if (code?.data) emit(code.data);
            }
          }
        } catch {
          /* keep scanning */
        }
      }
      timer = window.setTimeout(tick, 180);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, emit]);

  // Start automatically; always release the camera when leaving the page.
  useEffect(() => {
    void start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const scanPhoto = async (file: File) => {
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) {
        lastRef.current = { text: '', at: 0 };
        emit(code.data);
      } else setError('No QR code found in that photo. Take a closer, sharper photo of the card.');
    } catch {
      setError('Could not read that image.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900 aspect-[4/3] w-full">
        <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${active ? '' : 'hidden'}`} />
        <canvas ref={canvasRef} className="hidden" />
        {active ? (
          <>
            {/* Aiming frame */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={`h-[62%] aspect-square rounded-2xl border-4 ${paused ? 'border-amber-400' : 'border-emerald-400'} shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]`} />
            </div>
            <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-semibold text-white drop-shadow">
              {paused ? 'Processing…' : 'Point the camera at the household QR card'}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-neutral-300">
            <CameraOff className="h-8 w-8" />
            <p className="text-xs">{error || 'Camera is off.'}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {active ? (
          <button type="button" onClick={stop} className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-100">
            <CameraOff className="h-3.5 w-3.5" /> Stop camera
          </button>
        ) : (
          <button type="button" onClick={start} className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3 py-1.5 font-semibold text-white hover:bg-emerald-900">
            <Camera className="h-3.5 w-3.5" /> Start camera
          </button>
        )}
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          <SwitchCamera className="h-3.5 w-3.5" /> Switch camera
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-100">
          <ImageUp className="h-3.5 w-3.5" /> Scan from photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void scanPhoto(f);
            }}
          />
        </label>
      </div>
      {error && active && <p className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
};
