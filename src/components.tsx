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
          d="M49 31a17 17 0 0 1-25 15l-12 4 4-12A17 17 0 1 1 49 31Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M24 21c-2 0-4 3-4 5 0 7 10 17 18 17 3 0 6-3 6-5l-7-4-3 3c-4-2-7-5-9-9l3-2-4-5Z"
          fill="currentColor"
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
        Для реальной переписки понадобится аккаунт WhatsApp и авторизованный
        инстанс.
      </p>
      <ol className="setup-steps">
        <li>
          <strong>Создайте инстанс WhatsApp</strong>
          <p>
            Зарегистрируйтесь в личном кабинете GREEN-API, нажмите «Создать
            инстанс» и выберите «WhatsApp: Developer».
          </p>
        </li>
        <li>
          <strong>Привяжите аккаунт</strong>
          <p>
            В кабинете нажмите «Получить QR». На телефоне откройте WhatsApp →
            Связанные устройства → Привязка устройства. На iPhone этот раздел
            находится в настройках, на Android — в меню с тремя точками.
            Отсканируйте код и дождитесь статуса authorized.
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
        href="https://green-api.com/docs/before-start/"
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
