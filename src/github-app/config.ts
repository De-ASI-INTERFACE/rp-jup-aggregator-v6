import type { SyncConfig } from './types';

export function loadSyncConfig(): SyncConfig {
  const trackerUrl = process.env.EXTERNAL_TRACKER_URL;
  const trackerToken = process.env.EXTERNAL_TRACKER_TOKEN;
  if (!trackerUrl) throw new Error('[github-app] Missing required env: EXTERNAL_TRACKER_URL');
  if (!trackerToken) throw new Error('[github-app] Missing required env: EXTERNAL_TRACKER_TOKEN');
  return {
    trackerUrl,
    trackerToken,
    timeoutMs: Number(process.env.TRACKER_TIMEOUT_MS ?? 10_000),
    maxRetries: Number(process.env.TRACKER_MAX_RETRIES ?? 3),
    retryDelayMs: Number(process.env.TRACKER_RETRY_DELAY_MS ?? 500),
  };
}
