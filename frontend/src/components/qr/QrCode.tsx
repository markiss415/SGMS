/** Renders any text as a QR code image (generated in the browser, works offline). */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  value: string;
  size?: number;
  className?: string;
  label?: string;
  /** Called with the PNG data URL once generated (e.g. for a download button). */
  onReady?: (dataUrl: string) => void;
}

export const QrCode: React.FC<Props> = ({ value, size = 220, className = '', label, onReady }) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1f17', light: '#ffffff' } })
      .then((url) => {
        if (!alive) return;
        setSrc(url);
        onReady?.(url);
      })
      .catch(() => setSrc(''));
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} className={`animate-pulse rounded-lg bg-neutral-100 ${className}`} />;
  return <img src={src} width={size} height={size} alt={label || 'QR code'} className={`rounded-lg bg-white ${className}`} />;
};

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
