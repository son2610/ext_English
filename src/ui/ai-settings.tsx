import { useEffect, useState } from 'react';
import { z } from 'zod';
import { connectionBinding, effectiveAI, providerIds, providers, type AIConnection, type AIConfiguration, type ProviderId } from '../domain/ai-config';
import type { Settings } from '../domain/models';
import { keyStatus, loadRoutes, saveAIConfiguration, type KeyChanges } from '../ai/configuration';
import { settings } from '../data/repository';
import { send } from '../shared/messages';
import { StructuredClient } from '../ai/structured-client';
import './ai-settings.css';

export function AISettings({ config }: { config: Settings }) {
  const [draft, setDraft] = useState<AIConfiguration>(() => effectiveAI(config));
  const [saved, setSaved] = useState(() => JSON.stringify(effectiveAI(config)));
  const [keys, setKeys] = useState<KeyChanges>({}); const [stored, setStored] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [adding, setAdding] = useState<ProviderId>('deepseek');
  const [expanded, setExpanded] = useState(() => new Set(effectiveAI(config).connections.slice(0, 1).map(c => c.id)));
  useEffect(() => { void keyStatus(config).then(setStored).catch(() => setMessage('Chưa đọc được cấu hình khóa AI. Hãy tải lại trang.')); }, [config]);
  const dirty = saved !== JSON.stringify(draft) || Object.keys(keys).length > 0;
  function update(id: string, patch: Partial<AIConnection>) { setDraft(d => ({ ...d, connections: d.connections.map(c => c.id === id ? { ...c, ...patch } : c) })); }
  function move(index: number, direction: number) {
    setDraft(d => { const connections = [...d.connections]; const item = connections.splice(index, 1)[0]!; connections.splice(index + direction, 0, item); return { ...d, connections }; });
  }
  function toggle(id: string) { setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function add() {
    const id = crypto.randomUUID();
    setDraft(d => ({ ...d, connections: [...d.connections, { id, name: providers[adding].name, provider: adding, enabled: true, model: providers[adding].model, baseUrl: providers[adding].baseUrl }] }));
    setExpanded(current => new Set([...current, id]));
  }
  async function save() {
    setBusy(true); setMessage('Đang lưu cấu hình. Nếu Chrome hỏi quyền kết nối, hãy xác nhận trong hộp thoại của trình duyệt.');
    try {
      await saveAIConfiguration(draft, keys);
      const latest = await settings(); const ai = effectiveAI(latest);
      setDraft(ai); setSaved(JSON.stringify(ai)); setKeys({}); setStored(await keyStatus(latest));
      await send({ type: 'wake' });
      setMessage('Đã lưu cấu hình AI và thứ tự dự phòng. Các yêu cầu mới sẽ dùng cấu hình này.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Chưa lưu được cấu hình AI.'); }
    finally { setBusy(false); }
  }
  async function test(id: string, strong = false) {
    setBusy(true); setMessage('Đang kiểm tra kết nối và phản hồi JSON…');
    try {
      const route = (await loadRoutes()).find(r => r.connection.id === id);
      if (!route) throw new Error('Bật và lưu kết nối trước khi kiểm tra.');
      const response = await new StructuredClient([route], false, false).request('Kiểm tra kết nối. Trả connected=true và messageVi là một lời chào ngắn bằng tiếng Việt, theo JSON schema.', {}, z.object({ connected: z.literal(true), messageVi: z.string().min(1).max(200) }), false, undefined, strong ? 'explanation' : 'analysis');
      setMessage(`${route.connection.name} · ${strong ? route.connection.strongModel : route.connection.model}: kết nối và JSON hợp lệ. ${response.messageVi}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Chưa kiểm tra được kết nối.'); }
    finally { setBusy(false); }
  }
  return <section className="panel ai-settings" aria-label="Nhà cung cấp AI">
    <div className="section-heading"><div><span className="eyebrow">AI theo lựa chọn của bạn</span><h2>Nhà cung cấp AI & dự phòng</h2></div><span className="tag">{draft.connections.filter(c => c.enabled).length} đang bật</span></div>
    <p>Gọi theo thứ tự từ trên xuống. Khi AI lỗi mạng, quá tải, hết quota phía nhà cung cấp hoặc trả dữ liệu sai, LumaRead chuyển sang kết nối tiếp theo đang bật và đã có khóa.</p>
    <label className="checkbox-label"><input type="checkbox" disabled={busy} checked={draft.fallback} onChange={e => setDraft(d => ({ ...d, fallback: e.target.checked }))}/>Tự chuyển sang AI dự phòng khi gặp lỗi</label>
    <p className="muted">Khi bật dự phòng, cùng nội dung học có thể được gửi lần lượt đến các nhà cung cấp bạn cấu hình. Mọi lần gọi đều tính vào hạn mức chung và có thể phát sinh phí. Nếu tắt, chỉ dùng kết nối đầu tiên đang bật. Kết quả luôn được kiểm tra trước khi dùng.</p>
    <div className="ai-connections">{draft.connections.map((connection, index) => {
      const hasKey = keys[connection.id] === null ? false : !!keys[connection.id]?.trim() || stored[connection.id] === connectionBinding(connection);
      return <details className="ai-connection" key={connection.id} open={expanded.has(connection.id)}>
        <summary onClick={e => { e.preventDefault(); toggle(connection.id); }}><span className="ai-order">{index + 1}</span><span className="ai-summary"><strong>{connection.name}</strong><small>{providers[connection.provider].name} · {connection.model || 'Chưa chọn model'}</small></span><span className={`tag ${hasKey && connection.enabled ? 'green' : ''}`}>{!connection.enabled ? 'Đã tắt' : hasKey ? 'Có khóa' : 'Chưa có khóa'}</span></summary>
        <div className="ai-connection-body"><div className="ai-row-actions"><label className="checkbox-label"><input type="checkbox" disabled={busy} checked={connection.enabled} onChange={e => update(connection.id, { enabled: e.target.checked })}/>Bật kết nối</label><div className="actions left"><button disabled={busy || index === 0} aria-label={`Đưa ${connection.name} lên trên`} onClick={() => move(index, -1)}>↑ Lên</button><button disabled={busy || index === draft.connections.length - 1} aria-label={`Đưa ${connection.name} xuống dưới`} onClick={() => move(index, 1)}>↓ Xuống</button><button className="text-button danger" disabled={busy} onClick={() => setDraft(d => ({ ...d, connections: d.connections.filter(c => c.id !== connection.id) }))}>Gỡ kết nối</button></div></div>
        <div className="ai-fields"><label>Tên kết nối<input disabled={busy} maxLength={80} value={connection.name} onChange={e => update(connection.id, { name: e.target.value })}/></label><label>Model phân tích<input disabled={busy} maxLength={100} value={connection.model} onChange={e => update(connection.id, { model: e.target.value.trim() })} placeholder={providers[connection.provider].model || 'Tên model từ nhà cung cấp'}/></label>
        <label>Model chấm viết / giải thích (tùy chọn)<input disabled={busy} maxLength={100} value={connection.strongModel ?? ''} onChange={e => update(connection.id, { strongModel: e.target.value.trim() || undefined })} placeholder="Để trống để dùng model phân tích"/></label>
        <label>API key của {connection.name}<input disabled={busy} type="password" autoComplete="off" spellCheck={false} maxLength={4096} value={keys[connection.id] ?? ''} onChange={e => setKeys(k => { const next = { ...k }; if (e.target.value) next[connection.id] = e.target.value; else delete next[connection.id]; return next; })} placeholder={hasKey ? 'Để trống để giữ khóa hiện tại' : 'Dán khóa API riêng của nhà cung cấp này'}/></label></div>
        {connection.provider === 'compatible' ? <label>URL gốc API<input disabled={busy} type="url" maxLength={500} value={connection.baseUrl} placeholder="https://api.example.com/v1" onChange={e => update(connection.id, { baseUrl: e.target.value.trim().replace(/\/+$/, '') })}/><small className="muted">Dùng API Chat Completions có JSON mode. Không thêm /chat/completions. Đổi địa chỉ phải nhập lại khóa.</small></label> : <p className="muted">Địa chỉ nhận dữ liệu: <code>{connection.baseUrl}</code> · <a href={providers[connection.provider].console} target="_blank" rel="noopener noreferrer">Mở trang nhà cung cấp</a></p>}
        <div className="actions left"><button disabled={busy || dirty || !hasKey || !connection.enabled} onClick={() => void test(connection.id)}>Kiểm tra JSON</button>{connection.strongModel && <button disabled={busy || dirty || !hasKey || !connection.enabled} onClick={() => void test(connection.id, true)}>Kiểm tra model chấm viết</button>}<button className="text-button danger" disabled={busy || !hasKey} onClick={() => setKeys(k => ({ ...k, [connection.id]: null }))}>Xóa khóa</button></div>
        </div></details>;
    })}</div>
    {!draft.connections.length && <p>Chưa có kết nối. Thêm Gemini hoặc DeepSeek để bắt đầu.</p>}
    <div className="ai-add"><label>Thêm nhà cung cấp<select disabled={busy} value={adding} onChange={e => setAdding(e.target.value as ProviderId)}>{providerIds.map(id => <option value={id} key={id}>{providers[id].name}</option>)}</select></label><button disabled={busy || draft.connections.length >= 6} onClick={add}>+ Thêm kết nối</button></div>
    <p className="muted">Tối đa 6 kết nối; có thể thêm nhiều model của cùng nhà cung cấp. Tên model nhập được để dùng các bản mới. Khóa chỉ lưu trong hồ sơ Chrome, không đưa vào bản xuất dữ liệu hoặc gửi cho trang đang đọc. Ai đọc được hồ sơ máy vẫn có thể đọc khóa. OpenAI dùng khóa API riêng, không dùng đăng nhập ChatGPT.</p>
    <div className="actions left"><button className="primary" disabled={busy || !dirty} onClick={() => void save()}>Lưu cấu hình AI</button>{dirty && <button disabled={busy} onClick={() => { setDraft(JSON.parse(saved) as AIConfiguration); setKeys({}); setMessage('Đã bỏ thay đổi chưa lưu.'); }}>Bỏ thay đổi</button>}<small className="muted">Lưu trước khi kiểm tra; mỗi lần kiểm tra gửi một yêu cầu AI.</small></div>
    {message && <p className="hint-box" role="status">{message}</p>}
  </section>;
}
