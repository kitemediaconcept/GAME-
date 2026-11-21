import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Download,
  Copy,
  Check,
  Share2,
  QrCode,
  Smartphone,
  ExternalLink,
  Link2,
  RefreshCw,
} from 'lucide-react';
import { getFullAppUrls } from '../lib/routing.ts';
import { IStoreLogo } from './IStoreLogo.tsx';

interface QrCodeStudioProps {
  compact?: boolean;
  onOpenGame?: () => void;
}

const DEFAULT_CLOUDFLARE_URL = 'https://game.kitemediaconcept.workers.dev';

export function QrCodeStudio({ compact = false, onOpenGame }: QrCodeStudioProps) {
  const { gameUrl: detectedUrl, qrPageUrl, adminUrl } = getFullAppUrls();
  const isPreviewHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('run.app') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  const [targetUrl, setTargetUrl] = useState<string>(() =>
    isPreviewHost ? DEFAULT_CLOUDFLARE_URL : detectedUrl || DEFAULT_CLOUDFLARE_URL
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [transparentQrUrl, setTransparentQrUrl] = useState<string>('');
  const [posterDataUrl, setPosterDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const cleanTargetUrl = targetUrl.trim() || DEFAULT_CLOUDFLARE_URL;

  useEffect(() => {
    if (!cleanTargetUrl) return;
    let active = true;

    (async () => {
      try {
        const [purePng, transparentPng] = await Promise.all([
          QRCode.toDataURL(cleanTargetUrl, {
            width: 1200,
            margin: 3,
            errorCorrectionLevel: 'H',
            color: {
              dark: '#081722',
              light: '#ffffff',
            },
          }),
          QRCode.toDataURL(cleanTargetUrl, {
            width: 1200,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: {
              dark: '#081722',
              light: '#00000000',
            },
          }),
        ]);
        if (!active) return;
        setQrDataUrl(purePng);
        setTransparentQrUrl(transparentPng);

        // Render a crisp print/social branded poster PNG
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bg = ctx.createLinearGradient(0, 0, 0, 1350);
        bg.addColorStop(0, '#07131d');
        bg.addColorStop(0.65, '#0b2230');
        bg.addColorStop(1, '#081722');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1080, 1350);

        ctx.fillStyle = '#d9ff70';
        ctx.fillRect(0, 0, 1080, 18);

        ctx.fillStyle = '#d9ff70';
        ctx.font = '700 32px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ISTORE DIGITAL · PENALTY SHOOTOUT GIVEAWAY', 540, 118);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 84px system-ui, -apple-system, sans-serif';
        ctx.fillText('iPHONE vs ANDROID', 540, 212);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 34px system-ui, -apple-system, sans-serif';
        ctx.fillText('Scan QR to Play 5 Penalties & Enter Giveaway', 540, 276);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(170, 336, 740, 740, 44);
        ctx.fill();

        const img = new Image();
        img.onload = () => {
          if (!active) return;
          ctx.drawImage(img, 210, 376, 660, 660);

          ctx.fillStyle = '#d9ff70';
          ctx.beginPath();
          ctx.roundRect(220, 1130, 640, 86, 28);
          ctx.fill();

          ctx.fillStyle = '#081722';
          ctx.font = '800 34px system-ui, -apple-system, sans-serif';
          ctx.fillText('SCAN WITH PHONE CAMERA TO PLAY', 540, 1184);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '500 22px monospace';
          ctx.fillText(cleanTargetUrl, 540, 1280);

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
  }, [cleanTargetUrl]);

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
              url: cleanTargetUrl,
            });
            return;
          }
        }
        await navigator.share({
          title: 'iPhone vs Android Penalty Shootout Giveaway',
          text: 'Play 5 penalties and enter the giveaway!',
          url: cleanTargetUrl,
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
          <div className="mb-2 flex justify-center">
            <IStoreLogo variant="light" size="sm" />
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#d9ff70]">
            <QrCode className="h-3.5 w-3.5" />
            <span>Permanent Live Game QR</span>
          </div>
          <h2 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
            iPhone vs Android
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            Future game updates automatically load on this exact same QR code.
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

          <p className="mt-2.5 truncate font-mono text-[11px] text-slate-400">
            {cleanTargetUrl}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => downloadImage(qrDataUrl, 'istore-game-qr-1200px.png')}
              disabled={!qrDataUrl}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#d9ff70] px-3 py-2.5 text-xs font-extrabold text-[#081722] hover:bg-[#e5ff99] disabled:opacity-60 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>QR PNG (White)</span>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadImage(transparentQrUrl, 'istore-game-qr-transparent.png')
              }
              disabled={!transparentQrUrl}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Transparent PNG</span>
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() =>
                downloadImage(posterDataUrl || qrDataUrl, 'istore-giveaway-poster.png')
              }
              disabled={!qrDataUrl}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-[#d9ff70]" />
              <span>Full Poster PNG</span>
            </button>
            <button
              type="button"
              onClick={shareQrPoster}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5 text-[#d9ff70]" />
              <span>Share</span>
            </button>
          </div>
        </div>
      </div>

      {/* Permanent Target URL Editor & Direct Shareable Links */}
      <div className="space-y-4 lg:col-span-7">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-bold text-[#0b141a]">
            <Link2 className="h-4 w-4 text-emerald-700" />
            <span>Permanent QR Target Link (Auto-Updates)</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            The QR image points to this fixed URL. Whenever you push game updates to Cloudflare, everyone who scans your printed poster QR automatically gets the latest version — you never have to change the QR code.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://game.kitemediaconcept.workers.dev"
              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-[#f8faf9] px-3.5 py-2 font-mono text-xs text-[#0b141a] focus:border-[#081722] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setTargetUrl(DEFAULT_CLOUDFLARE_URL)}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Cloudflare URL</span>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTargetUrl(DEFAULT_CLOUDFLARE_URL)}
              className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-200"
            >
              {DEFAULT_CLOUDFLARE_URL}
            </button>
            <button
              type="button"
              onClick={() => setTargetUrl('https://game.istoredigital.co.in')}
              className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-200"
            >
              https://game.istoredigital.co.in
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="text-base font-bold text-[#0b141a]">Shareable QR & Game Links</h3>
          <p className="mt-1 text-xs text-slate-500">
            Download the 1200×1200 print-ready PNG (white or transparent) to place directly on your campaign posters, standees, and social posts.
          </p>

          <div className="mt-4 space-y-3">
            {[
              {
                key: 'game',
                label: 'Encoded Permanent Game Link (QR Target)',
                desc: 'Scanning the downloaded QR image opens this exact URL',
                url: cleanTargetUrl,
              },
              {
                key: 'qrPage',
                label: 'Shareable QR Download Page (/qr)',
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
