import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { GreenApi, errorText } from './api';
import { Logo, SetupGuide, ErrorNotice } from './components';
import { createDemoStore, DemoApi } from './demo';
import { ChatStore } from './store';
import { ChatWorkspace } from './ChatWorkspace';
import type { ChatApi } from './types';

export interface Session {
  api: ChatApi;
  store: ChatStore;
  demo: boolean;
  idInstance: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  return session ? (
    <ChatWorkspace session={session} onLogout={() => setSession(null)} />
  ) : (
    <Login onConnect={setSession} />
  );
}

function Login({ onConnect }: { onConnect: (session: Session) => void }) {
  const [idInstance, setId] = useState('');
  const [apiTokenInstance, setToken] = useState('');
  const [apiUrl, setUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const api = new GreenApi({ idInstance, apiTokenInstance, apiUrl });
      await api.connect(controller.signal);
      if (controller.signal.aborted) return;
      const store = new ChatStore(
        window.localStorage,
        `max-chat:v1:${api.credentials.apiUrl}:${api.credentials.idInstance}`,
      );
      onConnect({
        api,
        store,
        demo: false,
        idInstance: api.credentials.idInstance,
      });
    } catch (error) {
      if (!controller.signal.aborted) setError(errorText(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <header className="login-top">
        <div className="brand">
          <Logo small />
          <strong>MAX</strong>
          <span className="brand-divider" />
          <span className="muted small">через GREEN-API</span>
        </div>
        <button className="text-button" onClick={() => setHelp(true)}>
          <HelpCircle size={18} /> Как подключиться
        </button>
      </header>
      <div className="login-layout">
        <section className="login-intro">
          <span className="eyebrow">
            <span className="connection-dot" /> ПРОСТО БЫТЬ НА СВЯЗИ
          </span>
          <h1>
            Ваш MAX.
            <br />
            <span>В новом окне.</span>
          </h1>
          <p>
            Знакомый чат, только самое нужное.
            <br />
            Отправляйте сообщения и получайте ответы
            <br className="desktop-only" /> прямо в браузере.
          </p>
          <div className="chat-illustration" aria-hidden="true">
            <div className="illustration-day">Сегодня</div>
            <div className="illustration-bubble incoming">
              Привет! Ты на связи? <span>12:04</span>
            </div>
            <div className="illustration-bubble outgoing">
              Да, теперь и здесь 👋{' '}
              <span>
                12:05 <span>✓✓</span>
              </span>
            </div>
            <div className="illustration-bubble incoming">
              Тогда до встречи! <span>12:05</span>
            </div>
          </div>
          <div className="intro-footer">
            <ShieldCheck size={19} />
            <span>Токен остаётся только в памяти этой вкладки</span>
          </div>
        </section>
        <section className="login-card" aria-labelledby="login-heading">
          <span className="key-icon">
            <KeyRound size={24} />
          </span>
          <h2 id="login-heading">Подключите аккаунт</h2>
          <p className="muted">Введите данные инстанса из GREEN-API</p>
          <form onSubmit={submit}>
            <label htmlFor="instance">idInstance</label>
            <input
              id="instance"
              value={idInstance}
              onChange={(event) => setId(event.target.value)}
              placeholder="Например, 3100123456"
              inputMode="numeric"
              autoComplete="off"
              required
              disabled={busy}
            />
            <label htmlFor="token">apiTokenInstance</label>
            <div className="password-field">
              <input
                id="token"
                value={apiTokenInstance}
                onChange={(event) => setToken(event.target.value)}
                type={showToken ? 'text' : 'password'}
                placeholder="Ключ доступа к инстансу"
                autoComplete="off"
                required
                disabled={busy}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <label htmlFor="api-url">apiUrl</label>
            <input
              id="api-url"
              value={apiUrl}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://3100.api.green-api.com"
              type="url"
              autoComplete="off"
              required
              disabled={busy}
            />
            <p className="field-hint">Адрес API из карточки вашего инстанса</p>
            {error ? <ErrorNotice message={error} /> : null}
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Подключаемся…' : 'Подключиться'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="or-divider">
            <span>или</span>
          </div>
          <button
            className="secondary demo-button"
            disabled={busy}
            onClick={() =>
              onConnect({
                api: new DemoApi(),
                store: createDemoStore(),
                demo: true,
                idInstance: 'demo',
              })
            }
          >
            Открыть демочат
          </button>
          <p className="card-note muted">
            Без регистрации и реальных сообщений
          </p>
        </section>
      </div>
      <footer className="login-footer">
        <span>Текстовые сообщения. Ничего лишнего.</span>
        <span>React · GREEN-API</span>
      </footer>
      {help ? <SetupGuide onClose={() => setHelp(false)} /> : null}
    </main>
  );
}
