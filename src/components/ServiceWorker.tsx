'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/client/env';

/**
 * Registers the offline service worker in production builds. The build id in
 * the URL makes each deploy a new worker with fresh caches. In development
 * any earlier worker is removed so it cannot serve stale bundles.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register(`${BASE_PATH}/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'}`, {
          scope: `${BASE_PATH}/`,
        });
        const { active } = await navigator.serviceWorker.ready;
        // Hand over the bundles this page already loaded, so the first offline launch is complete.
        const urls = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => name.startsWith(window.location.origin) && name.includes('/_next/static/'));
        active?.postMessage({ type: 'CACHE_URLS', urls });
      } catch {
        // Unsupported or blocked: the app still works online and keeps its last snapshot in local storage.
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });
  }, []);

  return null;
}
