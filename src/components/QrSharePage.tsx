import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, Check, Share2, QrCode, Smartphone, ExternalLink } from 'lucide-react';
import { getFullAppUrls } from '../lib/routing.ts';

interface QrCodeStudioProps {
  compact?: boolean;
  onOpenGame?: () => void;
}

export function QrCodeStudio({ compact = false, onOpenGame }: QrCodeStudioProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [posterDataUrl, setPosterDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { gameUrl, qrPageUrl, adminUrl } = getFullAppUrls();

  useEffect(() => {
    if (!gameUrl) return;
    let active = true;

    (async () => {
      try {
        const purePng = await QRCode.toDataURL(gameUrl, {
          width: 720,
          margin: 3,
          errorCorrectionLevel: 'H',
          color: {
            dark: '#081722',
            light: '#ffffff',
          },
        });
        if (!active) return;
        setQrDataUrl(purePng);

        // Render a crisp branded poster PNG ready for WhatsApp/Instagram/print sharing
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Deep stadium night backdrop
        const bg = ctx.createLinearGradient(0, 0, 0, 1350);
        bg.addColorStop(0, '#07131d');
        bg.addColorStop(0.65, '#0b2230');
        bg.addColorStop(1, '#081722');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1080, 1350);

        // Top electric lime accent bar
        ctx.fillStyle = '#d9ff70';
        ctx.fillRect(0, 0, 1080, 18);

        // Eyebrow
        ctx.fillStyle = '#d9ff70';
        ctx.font = '700 32px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('iSTORE PRESENTS · PENALTY SHOOTOUT GIVEAWAY', 540, 118);

        // Main Headline
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 84px system-ui, -apple-system, sans-serif';
        ctx.fillText('iPHONE vs ANDROID', 540, 212);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 34px system-ui, -apple-system, sans-serif';
        ctx.fillText('Scan QR to Play 5 Penalties & Enter Giveaway', 540, 276);

        // Crisp white card housing the QR code
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(170, 336, 740, 740, 44);
        ctx.fill();

        const img = new Image();
        img.onload = () => {
          if (!active) return;
          ctx.drawImage(img, 210, 376, 660, 660);

          // Footer CTA pill
          ctx.fillStyle = '#d9ff70';
          ctx.beginPath();
          ctx.roundRect(220, 1130, 640, 86, 28);
          ctx.fill();

          ctx.fillStyle = '#081722';
          ctx.font = '800 34px system-ui, -apple-system, sans-serif';
          ctx.fillText('SCAN WITH PHONE CAMERA TO PLAY', 540, 1184);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '500 22px monospace';
          ctx.fillText(gameUrl, 540, 1280);

          setPosterDataUrl(canvas.toDataURL('image/png'));
        };
        img.src = purePng;
      } catch (err) {
        console.error('QR generation failed:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [gameUrl]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 2200);
  }, []);

  const downloadImage = (dataUrl: string, fileName: string) => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const shareQrPoster = async () => {
    if (navigator.share) {
      try {
        if (posterDataUrl && navigator.canShare) {
          const blob = await (await fetch(posterDataUrl)).blob();
          const file = new File([blob], 'iphone-vs-android-giveaway-qr.png', {
            type: 'image/png',
          });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'iPhone vs Android Penalty Shootout Giveaway',
              text: 'Scan this QR code or open the link to play 5 penalties and enter the giveaway!',
              files: [file],
              url: gameUrl,
            });
            return;
          }
        }
        await navigator.share({
          title: 'iPhone vs Android Penalty Shootout Giveaway',
          text: 'Play 5 penalties and enter the giveaway!',
          url: gameUrl,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    copyText('qrPage', qrPageUrl);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
      {/* Visual Scannable QR Card */}
      <div className="lg:col-span-5">
        <div className="overflow-hidden rounded-[28px] bg-[#081722] p-6 text-center text-white shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#d9ff70]">
            <QrCode className="h-3.5 w-3.5" />
            <span>Scan to Open Mobile Game</span>
          </div>
          <h2 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
            iPhone vs Android
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            Point any smartphone camera at this QR code to launch the shootout game directly.
          </p>

          <div className="mx-auto mt-5 flex aspect-square max-w-[260px] items-center justify-center rounded-3xl bg-white p-4 shadow-lg">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code linking to iPhone vs Android Penalty Shootout Game"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="h-44 w-44 animate-pulse rounded-2xl bg-slate-100" />
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => downloadImage(posterDataUrl || qrDataUrl, 'giveaway-qr-poster.png')}
              disabled={!qrDataUrl}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#d9ff70] px-3 py-2.5 text-xs font-extrabold text-[#081722] hover:bg-[#e5ff99] disabled:opacity-60 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Poster</span>
            </button>
            <button
              type="button"
              onClick={() => downloadImage(qrDataUrl, 'giveaway-qr-code.png')}
              disabled={!qrDataUrl}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Pure QR PNG</span>
            </button>
          </div>

          <button
            type="button"
            onClick={shareQrPoster}
            className="mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
          >
            <Share2 className="h-3.5 w-3.5 text-[#d9ff70]" />
            <span>Share QR Poster / Link</span>
          </button>
        </div>
      </div>

      {/* Direct Shareable Links Panel */}
      <div className="space-y-4 lg:col-span-7">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="text-base font-bold text-[#0b141a]">Shareable QR & Game Links</h3>
          <p className="mt-1 text-xs text-slate-500">
            Share the QR image or QR poster link on posters, social media, and WhatsApp. Scanning opens the mobile game immediately.
          </p>

          <div className="mt-4 space-y-3">
            {[
              {
                key: 'game',
                label: 'Public Mobile Game Link (QR Target)',
                desc: 'Share or encode this link in QR posters to open the game directly',
                url: gameUrl,
              },
              {
                key: 'qrPage',
                label: 'Shareable QR Poster Page (/qr)',
                desc: 'Standalone page displaying the scannable QR card & PNG downloads',
                url: qrPageUrl,
              },
              ...(compact
                ? [
                    {
                      key: 'admin',
                      label: 'Private Admin-Only Dashboard Link (/admin)',
                      desc: 'Keep private — only authorized admin Google account can access',
                      url: adminUrl,
                    },
                  ]
                : []),
            ].map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-slate-200 bg-[#f8faf9] p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[#0b141a]">{item.label}</div>
                    <div className="text-[11px] text-slate-500">{item.desc}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(item.key, item.url)}
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-[#090d11] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {copiedKey === item.key ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#d9ff70]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-2 truncate rounded-lg bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-600 border border-slate-200/70">
                  {item.url}
                </div>
              </div>
            ))}
          </div>

          {!compact && onOpenGame && (
            <button
              type="button"
              onClick={onOpenGame}
              className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#090d11] px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
            >
              <Smartphone className="h-4 w-4 text-[#d9ff70]" />
              <span>Open Mobile Penalty Game</span>
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function QrSharePage({ onOpenGame }: { onOpenGame: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-[#f4f6f5] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Campaign QR Distribution Kit
          </p>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight text-[#0b141a] sm:text-4xl">
            Scan to Play · Penalty Shootout Giveaway
          </h1>
        </div>
        <QrCodeStudio onOpenGame={onOpenGame} />
      </div>
    </div>
  );
}
