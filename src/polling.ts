import { ApiError, errorText } from './api';
import type { ChatApi } from './types';

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

// One consumer owns the queue: receive -> persist/process -> acknowledge.
export async function pollNotifications(
  api: Pick<ChatApi, 'receiveNotification' | 'deleteNotification'>,
  process: (body: unknown) => void,
  signal: AbortSignal,
  report: (error: string | null) => void,
  wait: (ms: number, signal?: AbortSignal) => Promise<void> = delay,
): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const notification = await api.receiveNotification(signal);
      if (signal.aborted) break;
      if (notification) {
        process(notification.body);
        await api.deleteNotification(notification.receiptId, signal);
      }
      failures = 0;
      report(null);
      await wait(300, signal);
    } catch (error) {
      if (signal.aborted) break;
      report(errorText(error));
      if (error instanceof ApiError && [401, 403].includes(error.status))
        return;
      await wait(Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)), signal);
    }
  }
}
