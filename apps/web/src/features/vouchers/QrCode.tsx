import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Renders text as a QR code (SVG). Generated in the browser; nothing is sent anywhere. */
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0b0d10', light: '#ffffff' } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div role="img" aria-label={label} style={{ width: size, height: size }} className="rounded-xl bg-white [&>svg]:size-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
  );
}
