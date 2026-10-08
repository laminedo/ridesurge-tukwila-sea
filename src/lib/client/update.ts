import { BASE_PATH } from './env';

/**
 * True when the server has a newer build of the app than the one running.
 * Every build stamps its id on the page's <html> element, so a fresh copy of
 * the page is enough to compare. Offline, or on any doubt, the answer is no.
 */
export async function newVersionAvailable(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return false;
  const running = document.documentElement.dataset.build;
  if (!running) return false;
  try {
    const response = await fetch(`${BASE_PATH}/`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const served = /data-build="([^"]+)"/.exec(await response.text())?.[1];
    return served !== undefined && served !== running;
  } catch {
    return false;
  }
}
