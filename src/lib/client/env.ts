/** True for the GitHub Pages build, where there is no server and the engine runs in the browser. */
export const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === '1';

/** URL prefix the app is served under ("" at a domain root, "/repo-name" on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
