import { describe, expect, it, vi } from 'vitest';
import { GreenApi, normalizePhone, validateCredentials } from './api';
import { ChatStore } from './store';
import { pollNotifications } from './polling';

const credentials = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '4100123456',
  apiTokenInstance: 'test-token',
};
const incoming = {
  typeWebhook: 'incomingMessageReceived',
  instanceData: { typeInstance: 'telegram', idInstance: 4100123456 },
  idMessage: 'remote-1',
  timestamp: 1760000000,
  senderData: {
    chatId: '123456',
    chatType: 'user',
    senderName: 'Анна',
    senderPhoneNumber: 79991234567,
  },
  messageData: {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: 'Ответ из Telegram' },
  },
};

describe('GREEN-API contract', () => {
  it('normalizes international numbers without rewriting explicit country codes', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('79991234567');
    expect(normalizePhone('8 999 123 45 67')).toBe('79991234567');
    expect(normalizePhone('+375 29 123 45 67')).toBe('375291234567');
    expect(() => normalizePhone('abc79991234567')).toThrow();
    expect(normalizePhone('+1 202 555 0123')).toBe('12025550123');
    expect(normalizePhone('+81 90 1234 567')).toBe('81901234567');
    expect(normalizePhone('+7 701 123 45 67')).toBe('77011234567');
    for (const value of [
      '+012345678',
      '123',
      '1234567890123456',
      '7+9991234567',
      '++79991234567',
    ])
      expect(() => normalizePhone(value)).toThrow();
  });
  it('prevents tokens being sent to arbitrary origins', () => {
    expect(() =>
      validateCredentials({
        ...credentials,
        apiUrl: 'https://green-api.com.evil.test',
      }),
    ).toThrow();
    expect(() =>
      validateCredentials({
        ...credentials,
        apiUrl: 'http://4100.api.green-api.com',
      }),
    ).toThrow();
    expect(() =>
      validateCredentials({
        ...credentials,
        apiUrl: 'https://4100.api.green-api.com/path',
      }),
    ).toThrow();
  });
  it('uses resolved Telegram chatId, JSON POST, and notification DELETE', async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const transport = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify(
            String(url).includes('sendMessage')
              ? { idMessage: '42' }
              : { result: true },
          ),
        );
      },
    );
    const api = new GreenApi(credentials, transport);
    expect(await api.sendMessage('123456', 'Привет')).toBe('42');
    await api.deleteNotification(17);
    expect(requests[0].url).toBe(
      'https://4100.api.green-api.com/waInstance4100123456/sendMessage/test-token',
    );
    expect(requests[0].init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      chatId: '123456',
      message: 'Привет',
    });
    expect(requests[1].url).toContain('/deleteNotification/test-token/17');
    expect(requests[1].init?.method).toBe('DELETE');
  });
  it('resolves an international phone through Telegram CheckAccount', async () => {
    const transport = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('{"exist":true,"chatId":"10000000"}'),
    );
    const api = new GreenApi(credentials, transport);
    expect(await api.checkAccount('+1 202 555 0123')).toBe('10000000');
    expect(transport.mock.calls[0]).toEqual([
      'https://4100.api.green-api.com/waInstance4100123456/checkAccount/test-token',
      expect.objectContaining({
        method: 'POST',
        body: '{"phoneNumber":12025550123}',
      }),
    ]);
  });
  it('explains Telegram search limits in an HTTP 200 response', async () => {
    const api = new GreenApi(
      credentials,
      vi.fn(
        async () =>
          new Response(
            '{"status":false,"data":{"status":"fail","reason":"rate_limit_exceeded","retryAfter":120}}',
          ),
      ),
    );
    await expect(api.checkAccount('79991234567')).rejects.toThrow(
      /ограничил поиск/,
    );
  });
  it('handles empty polling responses and checks that the instance is authorized', async () => {
    const api = new GreenApi(
      credentials,
      vi.fn(async () => new Response('')),
    );
    expect(await api.receiveNotification()).toBeNull();
    const unauthorized = new GreenApi(
      credentials,
      vi.fn(async () => new Response('{"stateInstance":"notAuthorized"}')),
    );
    await expect(unauthorized.connect()).rejects.toThrow(/авториз/);
  });
  it('rejects absent recipients and overlong/empty messages before sending', async () => {
    const api = new GreenApi(
      credentials,
      vi.fn(async () => new Response('{"exist":false,"chatId":""}')),
    );
    await expect(api.checkAccount('79991234567')).rejects.toThrow(/Telegram/);
    await expect(api.sendMessage('123456', ' ')).rejects.toThrow();
    await expect(api.sendMessage('123456', 'x'.repeat(4001))).rejects.toThrow();
  });
  it('gives useful errors without exposing token or server body', async () => {
    const api = new GreenApi(
      credentials,
      vi.fn(async () => new Response('secret test-token', { status: 401 })),
    );
    await expect(api.connect()).rejects.toThrow(/idInstance/);
    await expect(api.connect()).rejects.not.toThrow(/test-token/);
  });
});

describe('chat state', () => {
  it('treats Telegram noAccount as a visible sending failure', () => {
    const store = new ChatStore();
    store.createChat('123456', '79991234567');
    store.addMessage('123456', {
      id: '42',
      text: 'Привет',
      direction: 'outgoing',
      timestamp: 1760000000,
      status: 'queued',
    });
    store.applyNotification(
      {
        typeWebhook: 'outgoingMessageStatus',
        idMessage: '42',
        chatId: '123456',
        status: 'noAccount',
      },
      null,
    );
    expect(store.getSnapshot().chats[0].messages[0].status).toBe('failed');
  });
  it('routes incoming Telegram IDs to the chat resolved from a phone, deduplicates and persists', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const store = new ChatStore(storage, 'test');
    store.createChat('123456', '79991234567');
    store.applyNotification(incoming, null);
    store.applyNotification(incoming, null);
    expect(store.getSnapshot().chats).toHaveLength(1);
    expect(store.getSnapshot().chats[0].messages).toHaveLength(1);
    expect(store.getSnapshot().chats[0].unread).toBe(1);
    expect(store.getSnapshot().chats[0].messages[0].text).toBe(
      'Ответ из Telegram',
    );
    expect(storage.setItem).toHaveBeenCalled();
  });
  it('does not commit an incoming message if local persistence fails', () => {
    const store = new ChatStore(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      },
      'test',
    );
    expect(() => store.applyNotification(incoming, null)).toThrow(/сохранить/);
    expect(store.getSnapshot().chats).toHaveLength(0);
  });
  it('reconciles API echo received before send response without duplicate bubbles', () => {
    const store = new ChatStore();
    store.createChat('123456', '79991234567');
    store.addMessage('123456', {
      id: 'local',
      text: 'Привет',
      direction: 'outgoing',
      timestamp: 1760000000,
      status: 'pending',
    });
    store.applyNotification(
      {
        ...incoming,
        typeWebhook: 'outgoingAPIMessageReceived',
        idMessage: '42',
      },
      '123456',
    );
    store.updateMessage('123456', 'local', { id: '42', status: 'queued' });
    expect(store.getSnapshot().chats[0].messages).toHaveLength(1);
  });
  it('renders links as text and ignores unsupported files without creating empty bubbles', () => {
    const store = new ChatStore();
    store.applyNotification(
      {
        ...incoming,
        messageData: {
          typeMessage: 'extendedTextMessage',
          extendedTextMessageData: { text: 'https://example.com' },
        },
      },
      null,
    );
    store.applyNotification(
      {
        ...incoming,
        idMessage: 'file',
        messageData: { typeMessage: 'imageMessage' },
      },
      null,
    );
    expect(store.getSnapshot().chats[0].messages.map((m) => m.text)).toEqual([
      'https://example.com',
    ]);
  });
});

describe('notification lifecycle', () => {
  it('processes before acknowledging, retries receipt on delete failure, stops on abort', async () => {
    const controller = new AbortController();
    const order: string[] = [];
    let deletes = 0;
    const api = {
      receiveNotification: async () => ({ receiptId: 17, body: incoming }),
      deleteNotification: async () => {
        order.push('delete');
        if (++deletes === 1) throw new Error('offline');
        controller.abort();
      },
    };
    await pollNotifications(
      api,
      () => {
        order.push('process');
      },
      controller.signal,
      () => {},
      async () => {},
    );
    expect(order).toEqual(['process', 'delete', 'process', 'delete']);
  });
  it('never acknowledges a notification when processing/persistence failed', async () => {
    const controller = new AbortController();
    const remove = vi.fn();
    await pollNotifications(
      {
        receiveNotification: async () => ({ receiptId: 1, body: incoming }),
        deleteNotification: remove,
      },
      () => {
        throw new Error('quota');
      },
      controller.signal,
      () => controller.abort(),
      async () => {},
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
