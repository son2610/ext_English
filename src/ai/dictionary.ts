import { z } from 'zod';
import { db } from '../data/db';
import type { DictionaryEntry } from '../domain/enrichment';
export async function lookupDictionary(term: string): Promise<DictionaryEntry> {
  const word = term.trim().toLowerCase();
  if (!/^[a-z][a-z '-]{0,99}$/.test(word)) throw new Error('Chọn một từ hoặc cụm từ tiếng Anh để đối chiếu.');
  const database = await db; const cached = await database.get('dictionary', word);
  if (cached && Date.now() - cached.checkedAt < 30 * 86400000) return cached;
  let response: Response;
  try { response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(12000), credentials: 'omit' }); }
  catch { throw new Error('Không kết nối được từ điển. Chưa thể xác minh; đây không phải kết luận nội dung sai.'); }
  if (!response.ok && response.status !== 404) throw new Error(`Từ điển chưa phản hồi (HTTP ${response.status}). Hãy thử lại sau.`);
  const entry: DictionaryEntry = { id: word, word, checkedAt: Date.now(), status: 'not_found', definitions: [], phonetic: '', sources: [], license: '' };
  if (response.ok) {
    const schema = z.array(z.object({ phonetic: z.string().optional(), phonetics: z.array(z.object({ text: z.string().optional() })).optional(), sourceUrls: z.array(z.string()).optional(), license: z.object({ name: z.string().optional() }).optional(), meanings: z.array(z.object({ partOfSpeech: z.string(), definitions: z.array(z.object({ definition: z.string(), example: z.string().optional() })) })) }));
    const rows = schema.parse(await response.json());
    entry.status = 'found'; entry.phonetic = (rows[0]?.phonetic ?? rows[0]?.phonetics?.find(p => p.text)?.text ?? '').slice(0, 200);
    entry.definitions = rows.flatMap(row => row.meanings.flatMap(m => m.definitions.map(d => ({ partOfSpeech: m.partOfSpeech, definition: d.definition.slice(0, 3000), example: d.example?.slice(0, 3000) })))).slice(0, 8);
    entry.sources = [...new Set(rows.flatMap(row => row.sourceUrls ?? []).filter(url => /^https:\/\//.test(url)))].slice(0, 10);
    entry.license = rows[0]?.license?.name ?? 'Xem giấy phép tại nguồn';
  }
  await database.put('dictionary', entry); return entry;
}
