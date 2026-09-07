export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
export async function send<T>(message: unknown): Promise<T> {
  let reply: Reply<T>;
  try { reply = await chrome.runtime.sendMessage(message) as Reply<T>; }
  catch { throw new Error('Extension vừa được tải lại. Hãy tải lại trang web rồi thử lưu lần nữa.'); }
  if (!reply?.ok) throw new Error(reply?.error ?? 'Không kết nối được extension.');
  return reply.data;
}
