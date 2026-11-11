const PREFIX = "timberline:";
export function readValue(key: string, fallback: string) {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}
/** Drops every saved value whose key starts with the prefix, for features that no longer exist. */
export function forgetValues(prefix: string) {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX + prefix)) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    /* Nothing to forget where nothing can be stored. */
  }
}
export function writeValue(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* Private mode and full storage leave the game playable. */
  }
}
