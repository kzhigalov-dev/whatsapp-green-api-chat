import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  MessageCircle,
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
        `telegram-chat:v1:${api.credentials.apiUrl}:${api.credentials.idInstance}`,
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
    <main className="messenger login-page">
      <aside className="sidebar login-sidebar" aria-label="Чаты до подключения">
        <header className="sidebar-header">
          <div className="brand">
            <Logo small />
            <strong>Telegram</strong>
          </div>
        </header>
        <div className="list-heading">Ваши чаты</div>
        <div className="disconnected-list">
          <MessageCircle size={24} strokeWidth={1.5} />
          <p>Здесь начнётся переписка</p>
          <span>Подключите аккаунт, чтобы создать чат по номеру телефона.</span>
        </div>
        <footer className="sidebar-footer">
          <div className="account-info">
            <span className="connection-dot disconnected" />
            <span>
              Аккаунт не подключён<small>Сообщения через GREEN-API</small>
            </span>
          </div>
        </footer>
      </aside>
      <div className="connection-panel">
        <header className="connection-header">
          <div className="brand mobile-brand">
            <Logo small />
            <strong>Telegram</strong>
          </div>
          <span className="connection-heading">Подключение к Telegram</span>
          <button className="text-button" onClick={() => setHelp(true)}>
            <HelpCircle size={18} /> Как подключиться
          </button>
        </header>
        <div className="connection-content">
          <section className="login-card" aria-labelledby="login-heading">
            <h1 id="login-heading">Подключите аккаунт</h1>
            <p className="muted">Данные вашего инстанса GREEN-API</p>
            <form onSubmit={submit}>
              <label htmlFor="instance">idInstance</label>
              <input
                id="instance"
                value={idInstance}
                onChange={(event) => setId(event.target.value)}
                placeholder="Например, 4100123456"
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
                placeholder="https://4100.api.green-api.com"
                type="url"
                autoComplete="off"
                required
                disabled={busy}
              />
              <p className="field-hint">
                Адрес API из карточки вашего инстанса
              </p>
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
            <p className="privacy-note">
              <ShieldCheck size={16} /> Токен хранится только в памяти этой
              вкладки
            </p>
          </section>
        </div>
      </div>
      {help ? <SetupGuide onClose={() => setHelp(false)} /> : null}
    </main>
  );
}
