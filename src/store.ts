import type { Chat, Message, MessageStatus, Snapshot } from './types';

type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>;
const ranks: Record<MessageStatus, number> = {
  pending: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: -1,
};
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';

function mergeStatus(
  old?: MessageStatus,
  next?: MessageStatus,
): MessageStatus | undefined {
  if (!next) return old;
  if (next === 'failed')
    return old === 'read' || old === 'delivered' ? old : next;
  return !old || ranks[next] >= ranks[old] ? next : old;
}

function loadSnapshot(raw: string | null): Snapshot {
  if (!raw) return { chats: [] };
  const parsed = obj(JSON.parse(raw));
  if (!Array.isArray(parsed.chats)) throw new Error('invalid history');
  const chats = parsed.chats as Chat[];
  for (const chat of chats) {
    if (
      typeof chat.id !== 'string' ||
      typeof chat.name !== 'string' ||
      typeof chat.phone !== 'string' ||
      !Number.isFinite(chat.unread) ||
      !Array.isArray(chat.messages)
    )
      throw new Error('invalid chat');
    for (const message of chat.messages) {
      if (
        typeof message.id !== 'string' ||
        typeof message.text !== 'string' ||
        !Number.isFinite(message.timestamp) ||
        !['incoming', 'outgoing'].includes(message.direction)
      )
        throw new Error('invalid message');
      if (message.status === 'pending') {
        message.status = 'failed';
        message.error =
          'Отправка не подтверждена. Проверьте Telegram перед повтором.';
      }
    }
  }
  return { chats };
}

export class ChatStore {
  private snapshot: Snapshot = { chats: [] };
  private listeners = new Set<() => void>();
  private earlyStatuses = new Map<string, MessageStatus>();
  constructor(
    private readonly storage?: LocalStorage,
    private readonly key = 'telegram-chat',
  ) {
    if (storage) {
      try {
        this.snapshot = loadSnapshot(storage.getItem(key));
      } catch {
        throw new Error(
          'Не удалось прочитать локальную историю. Проверьте доступ к хранилищу браузера или используйте другой профиль.',
        );
      }
    }
  }
  getSnapshot = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private commit(chats: Chat[]): void {
    const next = { chats };
    try {
      this.storage?.setItem(this.key, JSON.stringify(next));
    } catch {
      throw new Error(
        'Не удалось сохранить историю. Освободите место в хранилище браузера. Получение уведомлений будет повторено.',
      );
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
  createChat(id: string, phone: string, name = ''): void {
    if (this.snapshot.chats.some((chat) => chat.id === id)) return;
    this.commit([
      ...this.snapshot.chats,
      {
        id,
        phone,
        name: name || (phone ? `+${phone}` : id),
        messages: [],
        unread: 0,
      },
    ]);
  }
  markRead(id: string): void {
    if (this.snapshot.chats.some((chat) => chat.id === id && chat.unread)) {
      this.commit(
        this.snapshot.chats.map((chat) =>
          chat.id === id ? { ...chat, unread: 0 } : chat,
        ),
      );
    }
  }
  addMessage(chatId: string, message: Message): void {
    this.commit(
      this.snapshot.chats.map((chat) =>
        chat.id !== chatId
          ? chat
          : {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  ...message,
                  status: mergeStatus(
                    message.status,
                    this.earlyStatuses.get(message.id),
                  ),
                },
              ],
            },
      ),
    );
  }
  updateMessage(chatId: string, id: string, patch: Partial<Message>): void {
    this.commit(
      this.snapshot.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        const echo = patch.id
          ? chat.messages.find(
              (message) => message.id === patch.id && message.id !== id,
            )
          : undefined;
        return {
          ...chat,
          messages: chat.messages
            .filter((message) => !echo || message !== echo)
            .map((message) =>
              message.id !== id
                ? message
                : {
                    ...message,
                    ...patch,
                    status: mergeStatus(
                      mergeStatus(message.status, patch.status),
                      echo?.status ?? this.earlyStatuses.get(patch.id ?? id),
                    ),
                  },
            ),
        };
      }),
    );
  }
  applyNotification(raw: unknown, activeId: string | null): void {
    const body = obj(raw);
    const kind = str(body.typeWebhook);
    const id = str(body.idMessage);
    if (kind === 'outgoingMessageStatus') {
      const rawStatus = str(body.status);
      const status = (
        ['noAccount', 'notInGroup'].includes(rawStatus) ? 'failed' : rawStatus
      ) as MessageStatus;
      if (!id || !['sent', 'delivered', 'read', 'failed'].includes(status))
        return;
      this.earlyStatuses.set(
        id,
        mergeStatus(this.earlyStatuses.get(id), status)!,
      );
      const chat = this.snapshot.chats.find((chat) =>
        chat.messages.some((message) => message.id === id),
      );
      if (chat) this.updateMessage(chat.id, id, { status });
      return;
    }
    const outgoing = [
      'outgoingAPIMessageReceived',
      'outgoingMessageReceived',
    ].includes(kind);
    if (kind !== 'incomingMessageReceived' && !outgoing) return;
    const sender = obj(body.senderData);
    if (sender.chatType && sender.chatType !== 'user') return;
    const chatId = str(sender.chatId);
    const data = obj(body.messageData);
    const text =
      data.typeMessage === 'textMessage'
        ? str(obj(data.textMessageData).textMessage)
        : data.typeMessage === 'extendedTextMessage' ||
            data.typeMessage === 'quotedMessage'
          ? str(obj(data.extendedTextMessageData).text)
          : '';
    if (!id || !chatId || !text) return;
    const existing = this.snapshot.chats.find((chat) => chat.id === chatId);
    if (existing?.messages.some((message) => message.id === id)) return;
    const phone = sender.senderPhoneNumber
      ? String(sender.senderPhoneNumber)
      : '';
    const name =
      str(sender.senderContactName) ||
      str(sender.senderName) ||
      (phone ? `+${phone}` : chatId);
    const chat: Chat = existing ?? {
      id: chatId,
      phone,
      name,
      messages: [],
      unread: 0,
    };
    const message: Message = {
      id,
      text,
      timestamp:
        typeof body.timestamp === 'number' ? body.timestamp : Date.now() / 1000,
      direction: outgoing ? 'outgoing' : 'incoming',
      status: outgoing ? (this.earlyStatuses.get(id) ?? 'sent') : undefined,
    };
    const updated: Chat = {
      ...chat,
      name: outgoing ? chat.name : name,
      phone: chat.phone || phone,
      unread: chat.unread + (!outgoing && activeId !== chatId ? 1 : 0),
      messages: [...chat.messages, message],
    };
    this.commit(
      existing
        ? this.snapshot.chats.map((chat) =>
            chat.id === chatId ? updated : chat,
          )
        : [...this.snapshot.chats, updated],
    );
  }
}
