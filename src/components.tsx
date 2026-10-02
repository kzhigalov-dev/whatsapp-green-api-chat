import { useEffect, useRef, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock3,
  X,
} from 'lucide-react';
import type { MessageStatus } from './types';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'logo-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path
          d="M13 30 51 15 43 49 30 39 23 45 25 34 43 23 29 36Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Avatar({ name, id }: { name: string; id: string }) {
  const color = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  const initials =
    name.startsWith('+') || /^\d/.test(name)
      ? name.slice(-2)
      : name
          .split(' ')
          .slice(0, 2)
          .map((word) => word[0])
          .join('');
  return (
    <span className={`avatar avatar-${color}`} aria-hidden="true">
      {initials}
    </span>
  );
}

const statusNames: Record<MessageStatus, string> = {
  pending: 'Отправляется',
  queued: 'В очереди GREEN-API',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
};
export function Status({ status = 'queued' }: { status?: MessageStatus }) {
  const Icon =
    status === 'pending' || status === 'queued'
      ? Clock3
      : status === 'failed'
        ? AlertCircle
        : ['read', 'delivered'].includes(status)
          ? CheckCheck
          : Check;
  return (
    <span
      className={`message-status status-${status}`}
      title={statusNames[status]}
      aria-label={statusNames[status]}
    >
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
    return () => {
      if (dialog && typeof dialog.close === 'function') dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={onClose}
    >
      <div className="modal-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function SetupGuide({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Подключение GREEN-API" onClose={onClose}>
      <p className="muted">
        Для реальной переписки понадобится аккаунт Telegram и авторизованный
        инстанс.
      </p>
      <ol className="setup-steps">
        <li>
          <strong>Создайте инстанс Telegram</strong>
          <p>
            Зарегистрируйтесь в личном кабинете GREEN-API, нажмите «Создать
            инстанс» и выберите «Telegram: Developer».
          </p>
        </li>
        <li>
          <strong>Привяжите аккаунт</strong>
          <p>
            В кабинете нажмите «Получить QR-код». На телефоне: Telegram →
            Настройки → Устройства → Подключить устройство. Отсканируйте код и
            дождитесь статуса authorized. Если запрошен облачный пароль, введите
            его только в кабинете GREEN-API.
          </p>
        </li>
        <li>
          <strong>Включите уведомления</strong>
          <p>
            Оставьте webhookUrl пустым. Включите входящие сообщения, исходящие
            сообщения с телефона и через API, а также статусы исходящих
            сообщений. Сохраните настройки.
          </p>
        </li>
        <li>
          <strong>Скопируйте данные доступа</strong>
          <p>
            Введите idInstance, apiTokenInstance и apiUrl из карточки инстанса.
            Затем создайте чат по номеру получателя.
          </p>
        </li>
      </ol>
      <a
        className="primary button-link"
        href="https://green-api.com/telegram/docs/before-start/"
        target="_blank"
        rel="noreferrer"
      >
        Официальная инструкция <ArrowUpRight size={17} />
      </a>
      <p className="small muted">
        Пока нет аккаунта? Деморежим позволяет проверить интерфейс без
        подключения.
      </p>
    </Modal>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
