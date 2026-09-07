export interface Pattern { id: string; text: string; meaning: string }
export interface Match { start: number; end: number; pattern: Pattern }
interface TrieNode { next: Map<string, number>; fail: number; output: Pattern[] }
const fold = (text: string) => text.replace(/[A-Z]/g, c => c.toLowerCase()).replace(/[’‘]/g, "'");
const word = (character: string | undefined) => !!character && /[\p{L}\p{N}_]/u.test(character);
export class AhoCorasick {
  private nodes: TrieNode[] = [{ next: new Map(), fail: 0, output: [] }];
  constructor(patterns: Pattern[]) {
    for (const pattern of patterns) {
      const text = fold(pattern.text.trim());
      if (text.length < 2 || text.length > 100) continue;
      let state = 0;
      for (const c of text) {
        let next = this.nodes[state]!.next.get(c);
        if (next === undefined) { next = this.nodes.length; this.nodes[state]!.next.set(c, next); this.nodes.push({ next: new Map(), fail: 0, output: [] }); }
        state = next;
      }
      this.nodes[state]!.output.push({ ...pattern, text });
    }
    const queue = [...this.nodes[0]!.next.values()];
    for (let index = 0; index < queue.length; index++) {
      const r = queue[index]!;
      for (const [c, child] of this.nodes[r]!.next) {
        queue.push(child);
        let fail = this.nodes[r]!.fail;
        while (fail && !this.nodes[fail]!.next.has(c)) fail = this.nodes[fail]!.fail;
        const next = this.nodes[fail]!.next.get(c) ?? 0;
        this.nodes[child]!.fail = next;
        this.nodes[child]!.output.push(...this.nodes[next]!.output);
      }
    }
  }
  search(input: string): Match[] {
    const text = fold(input); const matches: Match[] = []; let state = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      while (state && !this.nodes[state]!.next.has(c)) state = this.nodes[state]!.fail;
      state = this.nodes[state]!.next.get(c) ?? 0;
      for (const pattern of this.nodes[state]!.output) {
        const start = i + 1 - pattern.text.length;
        if (!word(text[start - 1]) && !word(text[i + 1])) matches.push({ start, end: i + 1, pattern });
      }
      if (matches.length >= 100) break;
    }
    return matches;
  }
}
