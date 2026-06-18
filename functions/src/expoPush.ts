import * as logger from 'firebase-functions/logger';

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  data?: Record<string, unknown>;
};

/** Send up to 99 Expo push messages per HTTP request. */
export async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<void> {
  if (!messages.length) return;
  for (let i = 0; i < messages.length; i += 99) {
    const chunk = messages.slice(i, i + 99);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error('Expo push API error', { status: res.status, text, count: chunk.length });
    }
  }
}
