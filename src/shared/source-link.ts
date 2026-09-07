import type { Source } from '../domain/models';
const encode = (value: string) => encodeURIComponent(value).replace(/-/g, '%2D');
export function sourceLink(source: Source): string {
  const url = new URL(source.frameUrl || source.url);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('URL không được hỗ trợ.');
  const text = source.exact.trim();
  const match = text.length > 200 ? `${encode(text.slice(0, 90))},${encode(text.slice(-90))}` : encode(text);
  const prefix = source.prefix.trim().split(/\s+/).slice(-4).join(' ');
  const suffix = source.suffix.trim().split(/\s+/).slice(0, 4).join(' ');
  url.hash = `${url.hash.split(':~:')[0] || '#'}:~:text=${prefix ? `${encode(prefix)}-,` : ''}${match}${suffix ? `,-${encode(suffix)}` : ''}`;
  return url.href;
}
