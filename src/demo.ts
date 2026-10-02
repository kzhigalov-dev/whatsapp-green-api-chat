import { delay } from './polling';
import { ChatStore } from './store';
import type { ChatApi, Notification } from './types';

export class DemoApi implements ChatApi {
  private queue: { notification: Notification; availableAt: number }[] = [];
  async connect(): Promise<void> {}
  async checkAccount(phone: string, signal?: AbortSignal): Promise<string> {
    await delay(200, signal);
    return `demo-${phone}`;
  }
  async sendMessage(
    chatId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<string> {
    await delay(180, signal);
    if (signal?.aborted) throw new DOMException('Отмена', 'AbortError');
    const id = crypto.randomUUID();
    const now = Date.now();
    this.queue.push({
      availableAt: now + 250,
      notification: {
        receiptId: now,
        body: {
          typeWebhook: 'outgoingMessageStatus',
          chatId,
          idMessage: id,
          status: 'read',
        },
      },
    });
    this.queue.push({
      availableAt: now + 800,
      notification: {
        receiptId: now + 1,
        body: {
          typeWebhook: 'incomingMessageReceived',
          idMessage: crypto.randomUUID(),
          timestamp: (now + 800) / 1000,
          senderData: {
            chatId,
            chatType: 'user',
            senderName:
              chatId === 'demo-79990000001' ? 'Анна' : 'Демо-собеседник',
          },
          messageData: {
            typeMessage: 'textMessage',
            textMessageData: {
              textMessage: `Получено: «${message.slice(0, 120)}${message.length > 120 ? '…' : ''}»\nЭто автоматический ответ в деморежиме.`,
            },
          },
        },
      },
    });
    return id;
  }
  async receiveNotification(
    signal?: AbortSignal,
  ): Promise<Notification | null> {
    await delay(400, signal);
    return !signal?.aborted && this.queue[0]?.availableAt <= Date.now()
      ? this.queue[0].notification
      : null;
  }
  async deleteNotification(receiptId: number): Promise<void> {
    this.queue = this.queue.filter(
      (item) => item.notification.receiptId !== receiptId,
    );
  }
}

export function createDemoStore(): ChatStore {
  const store = new ChatStore();
  const now = Date.now() / 1000;
  store.createChat('demo-79990000001', '79990000001', 'Анна');
  store.createChat('demo-79990000002', '79990000002', 'Алексей');
  store.addMessage('demo-79990000001', {
    id: 'sample-1',
    text: 'Привет! Проверим, как работает чат?',
    direction: 'incoming',
    timestamp: now - 260,
  });
  store.addMessage('demo-79990000001', {
    id: 'sample-2',
    text: 'Привет! Да, всё готово 👋',
    direction: 'outgoing',
    timestamp: now - 240,
    status: 'read',
  });
  store.addMessage('demo-79990000001', {
    id: 'sample-3',
    text: 'Отлично. Напиши мне что-нибудь — я отвечу.\n\nЭто демочат: сообщения остаются в браузере.',
    direction: 'incoming',
    timestamp: now - 220,
  });
  store.addMessage('demo-79990000002', {
    id: 'sample-4',
    text: 'Здесь можно переключаться между чатами.',
    direction: 'incoming',
    timestamp: now - 600,
  });
  return store;
}
