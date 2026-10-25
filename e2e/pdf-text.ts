import { inflateSync } from 'node:zlib';

// The text of a PDF the layout made, page by page, enough to check what it
// prints: every stream inflated, every font's ToUnicode map read, and each
// page's text shown through every map, so the page holds a string when any
// font prints it. Typst writes text as glyph ids, two bytes each, in literal
// strings.

type CMap = Map<number, string>;

function streams(pdf: Buffer): { dict: string; data: Buffer }[] {
  const out: { dict: string; data: Buffer }[] = [];
  const text = pdf.toString('latin1');
  const pattern = /<<((?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>|<[^<>]*>)*)>>\s*stream\r?\n/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    const raw = pdf.subarray(start, end);
    let data = raw;
    if (/\/FlateDecode/.test(match[1]!)) {
      try {
        data = inflateSync(raw);
      } catch {
        continue;
      }
    }
    out.push({ dict: match[1]!, data });
  }
  return out;
}

const utf16 = (hex: string) => {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
};

function cmapOf(source: string): CMap {
  const map: CMap = new Map();
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, from, to] of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(from!, 16), utf16(to!));
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, to] of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const first = parseInt(to!, 16);
      for (let code = parseInt(lo!, 16); code <= parseInt(hi!, 16); code++) {
        map.set(code, String.fromCharCode(first + code - parseInt(lo!, 16)));
      }
    }
  }
  return map;
}

// The bytes of a literal string's body, its escapes read.
function literal(body: string): number[] {
  const bytes: number[] = [];
  const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c !== '\\') {
      bytes.push(c.charCodeAt(0));
      continue;
    }
    const next = body[++i]!;
    const octal = /^[0-7]{1,3}/.exec(body.slice(i, i + 3));
    if (octal) {
      bytes.push(parseInt(octal[0], 8) & 0xff);
      i += octal[0].length - 1;
    } else if (next in escapes) bytes.push(escapes[next]!);
  }
  return bytes;
}

const hexBytes = (hex: string) => (hex.match(/../g) ?? []).map((h) => parseInt(h, 16));

// The glyph ids each text-showing operator of a content stream shows, a
// TJ array's strings joined.
function shown(content: string): number[][] {
  const out: number[][] = [];
  const string = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F]*>/g;
  const bytesOf = (token: string) => (token.startsWith('(') ? literal(token.slice(1, -1)) : hexBytes(token.slice(1, -1)));
  for (const [, array] of content.matchAll(/\[((?:\((?:\\.|[^\\()])*\)|[^\]])*)\]\s*TJ/g)) {
    out.push([...array!.matchAll(string)].flatMap((m) => bytesOf(m[0])));
  }
  for (const [token] of content.matchAll(/(?:\((?:\\.|[^\\()])*\)|<[0-9a-fA-F]*>)(?=\s*Tj)/g)) out.push(bytesOf(token));
  return out.map((bytes) => {
    const ids: number[] = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) ids.push((bytes[i]! << 8) | bytes[i + 1]!);
    return ids;
  });
}

const decode = (ids: number[], map: CMap) => ids.map((id) => map.get(id) ?? '').join('');

// Each content stream's text, once per font map; the order of the streams is
// the file's.
export function pdfTexts(pdf: Buffer): string[] {
  const all = streams(pdf);
  const maps = all.map((s) => s.data.toString('latin1')).filter((s) => s.includes('beginbfchar') || s.includes('beginbfrange')).map(cmapOf);
  return all
    .map((s) => s.data.toString('latin1'))
    .filter((s) => /\bTJ\b|\bTj\b/.test(s) && /\bTf\b/.test(s))
    .map((content) => {
      const runs = shown(content);
      return maps.map((map) => runs.map((ids) => decode(ids, map)).join(' ')).join('\n');
    });
}
