export type AppRoute = 'home' | 'admin' | 'qr';

/**
 * Returns the normalized base path (e.g. '' at root or '/game' when mounted at /game/).
 */
export function getAppBasePath(): string {
  const envBase = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  if (envBase && envBase !== '.') {
    return envBase;
  }
  if (typeof window !== 'undefined') {
    const clean = window.location.pathname.replace(/\/+$/, '');
    if (clean === '/game' || clean.startsWith('/game/')) {
      return '/game';
    }
  }
  return '';
}

/**
 * Detects whether the user opened the Game, Private Admin Console, or QR Share page.
 * Works identically at root (/, /admin, /qr) and under a subpath (/game, /game/admin, /game/qr).
 */
export function detectAppRoute(): AppRoute {
  if (typeof window === 'undefined') return 'home';
  const pathname = window.location.pathname.replace(/\/+$/, '');
  const hash = window.location.hash.replace(/\/+$/, '');

  if (pathname === '/admin' || pathname.endsWith('/admin') || hash === '#/admin') {
    return 'admin';
  }
  if (pathname === '/qr' || pathname.endsWith('/qr') || hash === '#/qr') {
    return 'qr';
  }
  return 'home';
}

export function getFullAppUrls() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const basePath = getAppBasePath();
  const baseUrl = `${origin}${basePath}`;
  return {
    gameUrl: basePath ? baseUrl : `${origin}/`,
    qrPageUrl: `${baseUrl}/qr`,
    adminUrl: `${baseUrl}/admin`,
  };
}
