import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ChatWorkspace } from './ChatWorkspace';
import { ChatStore } from './store';
import { ApiError } from './api';
import type { ChatApi } from './types';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

it('restarting reception does not cancel an outgoing message in progress', async () => {
  const store = new ChatStore();
  store.createChat('test', '79991234567', 'Анна');
  let sendSignal: AbortSignal | undefined;
  let finish: (id: string) => void = () => {};
  const api: ChatApi = {
    connect: async () => {},
    checkAccount: async () => 'test',
    sendMessage: (_id, _text, signal) => {
      sendSignal = signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    receiveNotification: async () => {
      throw new ApiError('Проверьте токен', 401);
    },
    deleteNotification: async () => {},
  };
  const user = userEvent.setup();
  render(
    <ChatWorkspace
      session={{ api, store, demo: true, idInstance: 'demo' }}
      onLogout={() => {}}
    />,
  );
  await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Текст');
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('button', { name: 'Возобновить' }));
  expect(sendSignal?.aborted).toBe(false);
  finish('remote');
  await waitFor(() =>
    expect(store.getSnapshot().chats[0].messages[0].status).toBe('queued'),
  );
});

it('preserves the draft and does not send when local history cannot be saved', async () => {
  let blocked = false;
  const store = new ChatStore({
    getItem: () => null,
    setItem: () => {
      if (blocked) throw new Error('quota');
    },
  });
  store.createChat('test', '79991234567', 'Анна');
  blocked = true;
  const send = vi.fn(async () => 'remote');
  const api: ChatApi = {
    connect: async () => {},
    checkAccount: async () => 'test',
    sendMessage: send,
    receiveNotification: async () => null,
    deleteNotification: async () => {},
  };
  const user = userEvent.setup();
  render(
    <ChatWorkspace
      session={{ api, store, demo: true, idInstance: 'demo' }}
      onLogout={() => {}}
    />,
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Сообщение' }),
    'Сохранить текст',
  );
  await user.keyboard('{Enter}');
  await screen.findByRole('alert');
  expect(
    (screen.getByRole('textbox', { name: 'Сообщение' }) as HTMLTextAreaElement)
      .value,
  ).toBe('Сохранить текст');
  expect(send).not.toHaveBeenCalled();
});

it('completes the assignment flow with a GREEN-API transport and stores no token', async () => {
  const maxKey = 'max-chat:v1:https://4100.api.green-api.com:4100123456';
  const oldHistory = JSON.stringify({
    chats: [
      {
        id: 'old-max',
        name: 'MAX',
        phone: '79990000000',
        unread: 0,
        messages: [],
      },
    ],
  });
  window.localStorage.setItem(maxKey, oldHistory);
  let replyReady = false;
  let consumed = false;
  const requests: string[] = [];
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    requests.push(url);
    let body: unknown = null;
    if (url.includes('getStateInstance'))
      body = { stateInstance: 'authorized' };
    if (url.includes('getSettings'))
      body = { incomingWebhook: 'yes', webhookUrl: '' };
    if (url.includes('checkAccount')) {
      expect(JSON.parse(String(init.body))).toEqual({
        phoneNumber: 79991234567,
      });
      body = { exist: true, chatId: '123456' };
    }
    if (url.includes('sendMessage')) {
      expect(JSON.parse(String(init.body))).toEqual({
        chatId: '123456',
        message: 'Привет из браузера',
      });
      replyReady = true;
      body = { idMessage: '42' };
    }
    if (url.includes('receiveNotification') && replyReady && !consumed) {
      consumed = true;
      body = {
        receiptId: 17,
        body: {
          typeWebhook: 'incomingMessageReceived',
          instanceData: { typeInstance: 'telegram', idInstance: 4100123456 },
          idMessage: 'reply',
          timestamp: Date.now() / 1000,
          senderData: {
            chatId: '123456',
            chatType: 'user',
            senderName: 'Анна',
          },
          messageData: {
            typeMessage: 'textMessage',
            textMessageData: { textMessage: 'Ответ получателя' },
          },
        },
      };
    }
    if (url.includes('deleteNotification')) body = { result: true };
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal('fetch', transport);
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('idInstance'), '4100123456');
  await user.type(
    screen.getByLabelText('apiTokenInstance'),
    'private-test-token',
  );
  await user.type(
    screen.getByLabelText('apiUrl'),
    'https://4100.api.green-api.com',
  );
  await user.click(screen.getByRole('button', { name: 'Подключиться' }));
  await user.click(await screen.findByRole('button', { name: 'Новый чат' }));
  await user.type(
    screen.getByLabelText('Номер телефона'),
    '+7 (999) 123-45-67',
  );
  await user.click(screen.getByRole('button', { name: 'Создать чат' }));
  await user.type(
    await screen.findByRole('textbox', { name: 'Сообщение' }),
    'Привет из браузера',
  );
  await user.keyboard('{Enter}');
  await within(screen.getByRole('log')).findByText('Ответ получателя');
  await waitFor(() =>
    expect(
      requests.some((url) =>
        url.includes('/deleteNotification/private-test-token/17'),
      ),
    ).toBe(true),
  );
  expect(window.localStorage.getItem(maxKey)).toBe(oldHistory);
  const telegramHistory = JSON.parse(
    window.localStorage.getItem(
      'telegram-chat:v1:https://4100.api.green-api.com:4100123456',
    ) ?? 'null',
  );
  expect(telegramHistory.chats).toHaveLength(1);
  expect(telegramHistory.chats[0].messages).toHaveLength(2);
  expect(Object.values(window.localStorage).join('')).not.toContain(
    'private-test-token',
  );
  await user.click(screen.getByRole('button', { name: 'Выйти' }));
  expect(screen.getByRole('button', { name: 'Подключиться' })).toBeDefined();
});

it('keeps failed text in chat, explains the error and allows explicit retry', async () => {
  let sends = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('getStateInstance'))
        return new Response('{"stateInstance":"authorized"}');
      if (url.includes('getSettings'))
        return new Response('{"incomingWebhook":"yes","webhookUrl":""}');
      if (url.includes('checkAccount'))
        return new Response('{"exist":true,"chatId":"123"}');
      if (url.includes('sendMessage'))
        return ++sends === 1
          ? new Response('', { status: 500 })
          : new Response('{"idMessage":"42"}');
      return new Response('null');
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('idInstance'), '4100123456');
  await user.type(screen.getByLabelText('apiTokenInstance'), 'token');
  await user.type(
    screen.getByLabelText('apiUrl'),
    'https://4100.api.green-api.com',
  );
  await user.click(screen.getByRole('button', { name: 'Подключиться' }));
  await user.click(await screen.findByRole('button', { name: 'Новый чат' }));
  await user.type(screen.getByLabelText('Номер телефона'), '79991234567');
  await user.click(screen.getByRole('button', { name: 'Создать чат' }));
  await user.type(
    await screen.findByRole('textbox', { name: 'Сообщение' }),
    'Важное сообщение',
  );
  await user.keyboard('{Enter}');
  expect((await screen.findByRole('alert')).textContent).toContain(
    'GREEN-API недоступен',
  );
  const retry = await screen.findByRole('button', {
    name: 'Повторить отправку',
  });
  expect(screen.getAllByText('Важное сообщение').length).toBeGreaterThan(0);
  await user.click(retry);
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Повторить отправку' }),
    ).toBeNull(),
  );
  expect(sends).toBe(2);
});

it('shows Telegram delivery errors without a message ID and acknowledges them without guessing', async () => {
  const store = new ChatStore();
  store.createChat('10000000', '79991234567', 'Анна');
  for (const id of ['first', 'second'])
    store.addMessage('10000000', {
      id,
      text: id,
      direction: 'outgoing',
      timestamp: 1760000000,
      status: 'queued',
    });
  let received = false;
  const remove = vi.fn(async () => {});
  const api: ChatApi = {
    connect: async () => {},
    checkAccount: async () => '10000000',
    sendMessage: async () => 'remote',
    receiveNotification: async () => {
      if (received) return null;
      received = true;
      return {
        receiptId: 20,
        body: {
          typeWebhook: 'outgoingMessageStatus',
          chatId: '10000000',
          status: 'noAccount',
        },
      };
    },
    deleteNotification: remove,
  };
  render(
    <ChatWorkspace
      session={{ api, store, demo: true, idInstance: 'demo' }}
      onLogout={() => {}}
    />,
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Telegram не смог отправить',
  );
  await waitFor(() =>
    expect(remove).toHaveBeenCalledWith(20, expect.any(AbortSignal)),
  );
  expect(
    store.getSnapshot().chats[0].messages.map((message) => message.status),
  ).toEqual(['queued', 'queued']);
});
