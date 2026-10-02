import type { ChatApi, Credentials, Notification } from './types';

export function normalizePhone(value: string): string {
  const input = value.trim();
  if (!/^\+?[\d\s()\-]+$/.test(input))
    throw new Error('Введите номер телефона в международном формате.');
  let phone = input.replace(/\D/g, '');
  if (!input.startsWith('+') && phone.length === 11 && phone.startsWith('8'))
    phone = '7' + phone.slice(1);
  if (!/^[1-9]\d{6,14}$/.test(phone))
    throw new Error('Укажите номер с кодом страны: от 7 до 15 цифр.');
  return phone;
}

export function validateCredentials(input: Credentials): Credentials {
  const idInstance = input.idInstance.trim();
  const apiTokenInstance = input.apiTokenInstance.trim();
  if (!/^\d+$/.test(idInstance))
    throw new Error('idInstance должен содержать только цифры.');
  if (!apiTokenInstance || /\s/.test(apiTokenInstance))
    throw new Error('Введите apiTokenInstance без пробелов.');
  let url: URL;
  try {
    url = new URL(input.apiUrl.trim());
  } catch {
    throw new Error('Скопируйте apiUrl из личного кабинета GREEN-API.');
  }
  if (
    url.protocol !== 'https:' ||
    !/^(?:\d+\.api|api)\.green-api\.com$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'apiUrl должен быть HTTPS-адресом API GREEN-API, например https://1103.api.green-api.com.',
    );
  }
  return { apiUrl: url.origin, idInstance, apiTokenInstance };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

export class GreenApi implements ChatApi {
  readonly credentials: Credentials;
  constructor(
    credentials: Credentials,
    private readonly transport: typeof fetch = fetch,
  ) {
    this.credentials = validateCredentials(credentials);
  }

  private async request<T>(
    method: string,
    verb: string,
    body?: unknown,
    signal?: AbortSignal,
    suffix = '',
  ): Promise<T> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials;
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      // Native browser fetch rejects a GreenApi instance as its receiver.
      const transport = this.transport;
      const response = await transport(
        `${apiUrl}/waInstance${idInstance}/${method}/${encodeURIComponent(apiTokenInstance)}${suffix}`,
        {
          method: verb,
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          ...(body === undefined
            ? {}
            : {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              }),
        },
      );
      if (!response.ok) {
        const messages: Record<number, string> = {
          400: 'Проверьте параметры запроса и настройки инстанса. Для получения сообщений webhookUrl должен быть пустым.',
          401: 'Проверьте idInstance и apiTokenInstance в личном кабинете.',
          403: 'Доступ запрещён. Проверьте токен, тариф и ограничения аккаунта.',
          466: 'Достигнут лимит тарифа. Проверьте ограничения инстанса в GREEN-API.',
          429: 'Слишком много запросов. Подождите немного.',
          469: 'GREEN-API временно ограничил проверку номера. Повторите позже.',
        };
        throw new ApiError(
          messages[response.status] ??
            `GREEN-API недоступен (HTTP ${response.status}). Повторите позже.`,
          response.status,
        );
      }
      const text = await response.text();
      try {
        return (text.trim() ? JSON.parse(text) : null) as T;
      } catch {
        throw new Error('GREEN-API вернул неожиданный ответ. Повторите позже.');
      }
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException('Операция отменена', 'AbortError');
      if (error instanceof TypeError)
        throw new Error('Нет связи с GREEN-API. Проверьте интернет и apiUrl.');
      if (controller.signal.aborted)
        throw new Error('GREEN-API не ответил вовремя. Попробуйте ещё раз.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  async connect(signal?: AbortSignal): Promise<void> {
    const result = await this.request<{ stateInstance?: string } | null>(
      'getStateInstance',
      'GET',
      undefined,
      signal,
    );
    if (result?.stateInstance !== 'authorized')
      throw new Error(
        'Инстанс не авторизован. Привяжите аккаунт WhatsApp в личном кабинете GREEN-API.',
      );
    const settings = await this.request<{
      webhookUrl?: string;
      incomingWebhook?: string;
    } | null>('getSettings', 'GET', undefined, signal);
    if (settings?.webhookUrl)
      throw new Error(
        'Очистите webhookUrl в настройках инстанса для получения сообщений через HTTP API.',
      );
    if (settings?.incomingWebhook !== 'yes')
      throw new Error(
        'Включите «Получать уведомления о входящих сообщениях и файлах» в настройках инстанса.',
      );
  }

  async checkAccount(phone: string, signal?: AbortSignal): Promise<string> {
    const normalized = normalizePhone(phone);
    const result = await this.request<{
      existsWhatsapp?: boolean;
      chatId?: string;
    } | null>(
      'checkWhatsapp',
      'POST',
      { chatId: `${normalized}@c.us` },
      signal,
    );
    if (result?.existsWhatsapp !== true)
      throw new Error(
        'Аккаунт WhatsApp не найден. Проверьте номер получателя.',
      );
    // Older instances return only existsWhatsapp; newer ones resolve a lid.
    const chatId = result.chatId || `${normalized}@c.us`;
    if (!/^\d+@(c\.us|lid)$/.test(chatId))
      throw new Error('GREEN-API вернул некорректный адрес личного чата.');
    return chatId;
  }

  async sendMessage(
    chatId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!message.trim() || message.length > 4000)
      throw new Error('Сообщение должно содержать от 1 до 4000 символов.');
    const result = await this.request<{ idMessage?: string } | null>(
      'sendMessage',
      'POST',
      { chatId, message },
      signal,
    );
    if (!result?.idMessage)
      throw new Error(
        'GREEN-API не подтвердил отправку. Проверьте переписку перед повтором.',
      );
    return String(result.idMessage);
  }

  async receiveNotification(
    signal?: AbortSignal,
  ): Promise<Notification | null> {
    const result = await this.request<Notification | null>(
      'receiveNotification',
      'GET',
      undefined,
      signal,
      '?receiveTimeout=20',
    );
    if (result === null) return null;
    if (
      !Number.isSafeInteger(result.receiptId) ||
      !result.body ||
      typeof result.body !== 'object'
    ) {
      throw new Error('Получено некорректное уведомление GREEN-API.');
    }
    return result;
  }

  async deleteNotification(
    receiptId: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.request<{ result?: boolean } | null>(
      'deleteNotification',
      'DELETE',
      undefined,
      signal,
      `/${receiptId}`,
    );
    if (result?.result !== true)
      throw new Error(
        'Не удалось подтвердить получение уведомления. Попытка будет повторена.',
      );
  }
}
