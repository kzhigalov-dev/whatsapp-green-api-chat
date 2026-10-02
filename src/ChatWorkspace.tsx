import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowUp,
  HelpCircle,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { errorText, normalizePhone } from './api';
import {
  Avatar,
  ErrorNotice,
  Logo,
  Modal,
  SetupGuide,
  Status,
} from './components';
import { pollNotifications } from './polling';
import type { Session } from './App';
import type { Chat, Message } from './types';

const time = (timestamp: number) =>
  new Date(timestamp * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
const dateLabel = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return date.toDateString() === new Date().toDateString()
    ? 'Сегодня'
    : date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
};

export function ChatWorkspace({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  const { api, store, demo } = session;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [activeId, setActiveId] = useState<string | null>(
    demo ? (snapshot.chats[0]?.id ?? null) : null,
  );
  const active = useRef(activeId);
  const life = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [help, setHelp] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [pollVersion, setPollVersion] = useState(0);
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    return () => controller.abort();
  }, [api, store]);

  useEffect(() => {
    const controller = new AbortController();
    void pollNotifications(
      api,
      (body) => {
        store.applyNotification(body, active.current);
        // GREEN-API can report failure without an idMessage. Show the error
        // without guessing which local message it belongs to.
        if (body && typeof body === 'object') {
          const notice = body as Record<string, unknown>;
          if (
            notice.typeWebhook === 'outgoingMessageStatus' &&
            !notice.idMessage &&
            ['failed', 'noAccount', 'suspended', 'yellowCard'].includes(
              String(notice.status),
            )
          ) {
            setActionError(
              'WhatsApp не смог отправить сообщение. Проверьте переписку, аккаунт получателя и ограничения инстанса перед повтором.',
            );
          }
        }
      },
      controller.signal,
      (error) => {
        if (!controller.signal.aborted) setPollError(error);
      },
    );
    return () => controller.abort();
  }, [api, store, pollVersion]);

  function selectChat(id: string | null) {
    try {
      if (id) store.markRead(id);
      setActiveId(id);
      active.current = id;
      setActionError('');
    } catch (error) {
      setActionError(errorText(error));
    }
  }

  async function send(chatId: string, text: string, retryId?: string) {
    if (sendLock.current) return false;
    const controller = life.current;
    if (!controller || controller.signal.aborted) return false;
    sendLock.current = true;
    setSending(true);
    setActionError('');
    const id = retryId ?? crypto.randomUUID();
    let saved = false;
    try {
      if (retryId)
        store.updateMessage(chatId, id, {
          status: 'pending',
          error: undefined,
        });
      else
        store.addMessage(chatId, {
          id,
          text,
          direction: 'outgoing',
          timestamp: Date.now() / 1000,
          status: 'pending',
        });
      saved = true;
      const remoteId = await api.sendMessage(chatId, text, controller.signal);
      if (!controller.signal.aborted)
        store.updateMessage(chatId, id, {
          id: remoteId,
          status: 'queued',
          error: undefined,
        });
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = errorText(error);
        setActionError(message);
        try {
          store.updateMessage(chatId, id, { status: 'failed', error: message });
        } catch {
          /* Error banner already preserves the storage/request failure. */
        }
      }
    } finally {
      sendLock.current = false;
      if (!controller.signal.aborted) setSending(false);
    }
    return saved;
  }

  const selected = snapshot.chats.find((chat) => chat.id === activeId);
  const chats = snapshot.chats
    .filter((chat) =>
      `${chat.name} ${chat.phone}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (b.messages.at(-1)?.timestamp ?? 0) -
        (a.messages.at(-1)?.timestamp ?? 0),
    );

  return (
    <main className={`messenger ${selected ? 'has-selection' : ''}`}>
      <aside className="sidebar" aria-label="Список чатов">
        <header className="sidebar-header">
          <div className="brand">
            <Logo small />
            <strong>WhatsApp</strong>
            {demo ? <span className="demo-tag">ДЕМО</span> : null}
          </div>
          <button
            className="icon-button new-chat-button"
            aria-label="Новый чат"
            title="Новый чат"
            onClick={() => setNewChat(true)}
          >
            <Plus size={23} />
          </button>
        </header>
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Поиск чатов"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск"
          />
          {query ? (
            <button
              className="icon-button"
              aria-label="Очистить поиск"
              onClick={() => setQuery('')}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
        <div className="list-heading">
          Все чаты <span>{snapshot.chats.length}</span>
        </div>
        <nav className="chat-list" aria-label="Чаты">
          {chats.map((chat) => {
            const last = chat.messages.at(-1);
            return (
              <button
                key={chat.id}
                className={`chat-row ${activeId === chat.id ? 'selected' : ''}`}
                onClick={() => selectChat(chat.id)}
                aria-current={activeId === chat.id ? 'true' : undefined}
              >
                <Avatar name={chat.name} id={chat.id} />
                <span className="chat-row-content">
                  <span className="chat-row-top">
                    <strong>{chat.name}</strong>
                    {last ? <time>{time(last.timestamp)}</time> : null}
                  </span>
                  <span className="chat-row-bottom">
                    <span>
                      {last
                        ? `${last.direction === 'outgoing' ? 'Вы: ' : ''}${last.text}`
                        : 'Пока нет сообщений'}
                    </span>
                    {chat.unread ? (
                      <b className="unread-badge">{chat.unread}</b>
                    ) : last?.direction === 'outgoing' ? (
                      <Status status={last.status} />
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
          {!chats.length ? (
            <div className="list-empty">
              <MessageCircle size={27} />
              <p>{query ? 'Чаты не найдены' : 'Здесь будут ваши чаты'}</p>
              {!query ? <span>Нажмите +, чтобы начать переписку</span> : null}
            </div>
          ) : null}
        </nav>
        <footer className="sidebar-footer">
          <div className="account-info">
            <span className={`connection-dot ${pollError ? 'offline' : ''}`} />
            <span>
              {demo
                ? 'Демонстрационный режим'
                : `Инстанс ${session.idInstance}`}
              <small>
                {pollError
                  ? 'Получение приостановлено'
                  : demo
                    ? 'Сообщения только в браузере'
                    : 'GREEN-API подключён'}
              </small>
            </span>
          </div>
          <div className="account-actions">
            <button
              className="icon-button"
              aria-label="Инструкция по подключению"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Выйти"
              title="Выйти"
              onClick={onLogout}
            >
              <LogOut size={19} />
            </button>
          </div>
        </footer>
      </aside>
      <section className="conversation" aria-label="Переписка">
        {demo ? (
          <div className="demo-banner">
            <span className="connection-dot" />
            <span>Деморежим. Собеседник отвечает автоматически.</span>
            <button onClick={onLogout}>
              Подключить WhatsApp <span aria-hidden="true">↗</span>
            </button>
          </div>
        ) : null}
        {pollError ? (
          <div className="connection-warning" role="alert">
            <span>{pollError}</span>
            <button onClick={() => setPollVersion((version) => version + 1)}>
              Возобновить
            </button>
          </div>
        ) : null}
        {actionError ? (
          <div className="action-error">
            <ErrorNotice message={actionError} />
            <button
              className="icon-button"
              aria-label="Скрыть ошибку"
              onClick={() => setActionError('')}
            >
              <X size={17} />
            </button>
          </div>
        ) : null}
        {selected ? (
          <ChatView
            key={selected.id}
            chat={selected}
            demo={demo}
            busy={sending}
            onBack={() => selectChat(null)}
            onSend={(text) => send(selected.id, text)}
            onRetry={(message) => send(selected.id, message.text, message.id)}
          />
        ) : (
          <div className="conversation-empty">
            <div className="empty-logo">
              <Logo />
            </div>
            <h1>Выберите чат или создайте новый</h1>
            <p>
              Для новой переписки понадобится
              <br />
              номер телефона получателя в WhatsApp.
            </p>
            <button className="primary" onClick={() => setNewChat(true)}>
              <Plus size={18} />
              Создать первый чат
            </button>
          </div>
        )}
      </section>
      {newChat ? (
        <NewChat
          session={session}
          onClose={() => setNewChat(false)}
          onCreated={(id) => {
            selectChat(id);
            setQuery('');
            setNewChat(false);
          }}
        />
      ) : null}
      {help ? <SetupGuide onClose={() => setHelp(false)} /> : null}
    </main>
  );
}

function NewChat({
  session,
  onClose,
  onCreated,
}: {
  session: Session;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const normalized = normalizePhone(phone);
      const existing = session.store
        .getSnapshot()
        .chats.find((chat) => chat.phone === normalized);
      const chatId =
        existing?.id ??
        (await session.api.checkAccount(normalized, controller.signal));
      if (controller.signal.aborted) return;
      session.store.createChat(chatId, normalized);
      onCreated(chatId);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorText(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Modal title="Новый чат" onClose={onClose}>
      <p className="muted">Введите номер телефона получателя в WhatsApp.</p>
      <form onSubmit={submit}>
        <label htmlFor="phone">Номер телефона</label>
        <input
          id="phone"
          type="tel"
          autoFocus
          autoComplete="off"
          placeholder="+7 999 123-45-67"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          disabled={busy}
        />
        <p className="field-hint">Международный формат с кодом страны</p>
        {error ? <ErrorNotice message={error} /> : null}
        <button className="primary" disabled={busy}>
          {busy ? 'Ищем получателя…' : 'Создать чат'}
          <ArrowUp size={17} />
        </button>
      </form>
      {session.demo ? (
        <p className="small muted">
          В деморежиме номер не проверяется в WhatsApp.
        </p>
      ) : null}
    </Modal>
  );
}

function ChatView({
  chat,
  demo,
  busy,
  onBack,
  onSend,
  onRetry,
}: {
  chat: Chat;
  demo: boolean;
  busy: boolean;
  onBack: () => void;
  onSend: (text: string) => Promise<boolean>;
  onRetry: (message: Message) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length]);
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !draft.trim() || draft.length > 4000) return;
    const text = draft;
    setDraft('');
    void onSend(text).then((saved) => {
      if (!saved) setDraft((current) => current || text);
    });
    textarea.current?.focus();
  }
  return (
    <>
      <header className="conversation-header">
        <button
          className="icon-button back-button"
          aria-label="Назад к чатам"
          onClick={onBack}
        >
          <ArrowLeft size={22} />
        </button>
        <Avatar name={chat.name} id={chat.id} />
        <div>
          <h2>{chat.name}</h2>
          <span>
            {demo
              ? 'Демо-собеседник'
              : chat.phone
                ? `+${chat.phone}`
                : 'Личный чат WhatsApp'}
          </span>
        </div>
      </header>
      <div
        className="message-scroll"
        role="log"
        aria-label="Сообщения"
        aria-live="polite"
      >
        <div className="messages-inner">
          {!chat.messages.length ? (
            <div className="first-message">
              <MessageCircle size={30} />
              <h3>Пока тихо</h3>
              <p>Напишите первое сообщение</p>
            </div>
          ) : null}
          {chat.messages.map((message, index) => {
            const day = dateLabel(message.timestamp);
            return (
              <div key={message.id}>
                {index === 0 ||
                day !== dateLabel(chat.messages[index - 1].timestamp) ? (
                  <div className="date-divider">
                    <span>{day}</span>
                  </div>
                ) : null}
                <div className={`message-row ${message.direction}`}>
                  <div
                    className={`message-bubble ${message.status === 'failed' ? 'failed' : ''}`}
                  >
                    <p>{message.text}</p>
                    <span className="message-meta">
                      <time>{time(message.timestamp)}</time>
                      {message.direction === 'outgoing' ? (
                        <Status status={message.status} />
                      ) : null}
                    </span>
                    {message.status === 'failed' ? (
                      <div className="message-failure">
                        <span>
                          {message.error ||
                            'WhatsApp не подтвердил доставку. Проверьте чат перед повтором.'}
                        </span>
                        <button
                          disabled={busy}
                          onClick={() => void onRetry(message)}
                          aria-label="Повторить отправку"
                        >
                          Повторить
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>
      </div>
      <form className="composer" onSubmit={submit}>
        <div className="composer-field">
          <textarea
            ref={textarea}
            rows={1}
            aria-label="Сообщение"
            placeholder="Написать сообщение…"
            value={draft}
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <span className="character-count">
            {draft.length ? `${draft.length} / 4000` : 'Enter ↵'}
          </span>
        </div>
        <button
          className="send-button"
          aria-label="Отправить сообщение"
          title="Отправить сообщение"
          disabled={busy || !draft.trim()}
          type="submit"
        >
          <ArrowUp size={23} />
        </button>
      </form>
      <div className="composer-hint">
        Enter — отправить · Shift + Enter — новая строка
      </div>
    </>
  );
}
