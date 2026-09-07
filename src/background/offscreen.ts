import { exportData } from '../data/backup';
const urls = new Set<string>();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id || typeof message !== 'object' || !message || !('target' in message) || message.target !== 'offscreen' || !('type' in message)) return false;
  if (message.type === 'backup-blob') {
    void exportData().then(data => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      urls.add(url); respond({ ok: true, data: { url } });
    }, () => respond({ ok: false, error: 'Không thể tạo file sao lưu.' }));
    return true;
  }
  if (message.type === 'revoke' && 'url' in message && typeof message.url === 'string' && urls.has(message.url)) { URL.revokeObjectURL(message.url); urls.delete(message.url); respond({ ok: true, data: null }); }
  return false;
});
