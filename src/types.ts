export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}
export type MessageStatus =
  'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export interface Message {
  id: string;
  text: string;
  timestamp: number;
  direction: 'incoming' | 'outgoing';
  status?: MessageStatus;
  error?: string;
}
export interface Chat {
  id: string;
  phone: string;
  name: string;
  messages: Message[];
  unread: number;
}
export interface Snapshot {
  chats: Chat[];
}
export interface Notification {
  receiptId: number;
  body: unknown;
}
export interface ChatApi {
  connect(signal?: AbortSignal): Promise<void>;
  checkAccount(phone: string, signal?: AbortSignal): Promise<string>;
  sendMessage(
    chatId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<string>;
  receiveNotification(signal?: AbortSignal): Promise<Notification | null>;
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void>;
}
