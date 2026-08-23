export type Scalar = string | number | boolean;

export interface FenceInfo {
  lang?: string;
  attrs: Record<string, Scalar>;
  highlight: number[];
}

export interface ParseOptions {
  lowerCaseKeys?: boolean;
  treatFirstBareAsLang?: boolean;
}

export interface FenceBlock {
  info: string;
  code: string;
}

export type KnownKey = "title" | "filename" | "lineNumbers" | "pinned" | "collapsed";

export interface NormalizeOptions {
  lowercaseKeys?: boolean;
  mergeHighlightAttr?: boolean;
  keyMap?: Partial<Record<KnownKey, string[]>>;
}

export interface NormalizedMeta {
  lang?: string;
  highlight: number[];
  title?: string;
  filename?: string;
  lineNumbers?: boolean;
  pinned?: boolean;
  collapsed?: boolean;
  attrs: Record<string, Scalar>;
}

function coerceBool(val: Scalar): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  return !["false", "0", "no", "off"].includes(val.toLowerCase());
}

interface Cursor {
  index: number;
  str: string;
  length: number;
}

const isSpace = (c?: string) => c === " " || c === "\t" || c === "\n" || c === "\r";
const isDigit = (c?: string) => c !== undefined && c >= "0" && c <= "9";

function skipWs(cursor: Cursor): void {
  while (cursor.index < cursor.length && isSpace(cursor.str[cursor.index])) cursor.index++;
}

function readQuoted(cursor: Cursor, quote: '"' | "'"): string {
  cursor.index++;
  let out = "";
  while (cursor.index < cursor.length) {
    const c = cursor.str[cursor.index++];
    if (c === "\\") {
      if (cursor.index >= cursor.length) throw new Error("unterminated escape");
      const e = cursor.str[cursor.index++];
      switch (e) {
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case '"':
          out += '"';
          break;
        case "'":
          out += "'";
          break;
        case "\\":
          out += "\\";
          break;
        default:
          out += e;
          break;
      }
    } else if (c === quote) {
      return out;
    } else {
      out += c;
    }
  }
  throw new Error("unterminated string");
}

function readBare(cursor: Cursor): string {
  const start = cursor.index;
  while (cursor.index < cursor.length) {
    const c = cursor.str[cursor.index];
    if (isSpace(c) || c === "=" || c === "{" || c === "}") break;
    cursor.index++;
  }
  return cursor.str.slice(start, cursor.index);
}

function coerceScalar(raw: string, fromQuoted: boolean): Scalar {
  if (fromQuoted) return raw;
  const l = raw.toLowerCase();
  if (l === "true") return true;
  if (l === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
  }
  return raw;
}

function expectDigit(cursor: Cursor): number {
  if (!isDigit(cursor.str[cursor.index])) throw new Error(`expected digit at ${cursor.index}`);
  const start = cursor.index;
  while (isDigit(cursor.str[cursor.index])) cursor.index++;
  return parseInt(cursor.str.slice(start, cursor.index), 10);
}

function parseHighlightBlock(cursor: Cursor, hl: Set<number>): void {
  cursor.index++;
  skipWs(cursor);
  let needValue = true;
  while (cursor.index < cursor.length) {
    if (cursor.str[cursor.index] === "}") {
      cursor.index++;
      return;
    }
    if (cursor.str[cursor.index] === ",") {
      if (needValue) throw new Error("trailing comma in highlight block");
      cursor.index++;
      skipWs(cursor);
      needValue = true;
      continue;
    }
    const startLine = expectDigit(cursor);
    let endLine = startLine;
    skipWs(cursor);
    if (cursor.str[cursor.index] === "-") {
      cursor.index++;
      skipWs(cursor);
      endLine = expectDigit(cursor);
    }
    for (let k = Math.min(startLine, endLine); k <= Math.max(startLine, endLine); k++) hl.add(k);
    skipWs(cursor);
    needValue = false;
  }
  throw new Error("unterminated highlight block");
}

function readValue(cursor: Cursor): Scalar {
  skipWs(cursor);
  const currentChar = cursor.str[cursor.index];
  if (currentChar === '"' || currentChar === "'") {
    return readQuoted(cursor, currentChar as '"' | "'");
  }
  const raw = readBare(cursor);
  return coerceScalar(raw, false);
}

export function parseInfo(info: string, opts: ParseOptions = {}): FenceInfo {
  const lowerCaseKeys = opts.lowerCaseKeys ?? true;
  const treatFirstBareAsLang = opts.treatFirstBareAsLang ?? true;

  const cursor: Cursor = { index: 0, str: info, length: info.length };

  let lang: string | undefined;
  const attrs: Record<string, Scalar> = {};
  const hl = new Set<number>();
  let sawBareToken = false;

  skipWs(cursor);
  while (cursor.index < cursor.length) {
    if (cursor.str[cursor.index] === "{") {
      parseHighlightBlock(cursor, hl);
      skipWs(cursor);
      continue;
    }

    const token = readBare(cursor);
    if (!token) {
      if (cursor.str[cursor.index] === "}") throw new Error(`unexpected '}' at ${cursor.index}`);
      if (cursor.str[cursor.index] === "=") throw new Error(`unexpected '=' at ${cursor.index}`);
      if (cursor.index < cursor.length) cursor.index++;
      skipWs(cursor);
      continue;
    }

    skipWs(cursor);
    if (cursor.str[cursor.index] === "=") {
      cursor.index++;
      const value = readValue(cursor);
      const key = lowerCaseKeys ? token.toLowerCase() : token;
      attrs[key] = value;
      skipWs(cursor);
      continue;
    }

    const firstBare = !sawBareToken;
    if (firstBare && treatFirstBareAsLang) {
      lang = token;
    } else {
      const key = lowerCaseKeys ? token.toLowerCase() : token;
      attrs[key] = true;
    }
    sawBareToken = true;
    skipWs(cursor);
  }

  const base = { attrs, highlight: Array.from(hl).sort((a, b) => a - b) };
  return lang !== undefined ? { ...base, lang } : base;
}

export function extractBlocks(md: string): FenceBlock[] {
  const re = /(^|\r?\n)[ \t]{0,3}(```+|~~~+)([^\r\n]*)\r?\n([\s\S]*?)\r?\n\2(?=\r?\n|$)/g;
  const out: FenceBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const [, , , infoRaw = "", code = ""] = m;
    out.push({ info: infoRaw.trim(), code });
  }
  return out;
}

export function parseBlocks(
  md: string,
  opts?: ParseOptions,
): Array<FenceBlock & { meta: FenceInfo }> {
  return extractBlocks(md).map((b) => ({ ...b, meta: parseInfo(b.info, opts) }));
}

export function parseLineSpec(v: Scalar): number[] {
  if (typeof v === "number" && Number.isFinite(v)) return [Math.trunc(v)];
  if (typeof v !== "string") return [];

  const set = new Set<number>();
  const parts = v
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const isDigits = (s: string) => /^\d+$/.test(s);

  for (const part of parts) {
    const dash = part.indexOf("-");
    if (dash >= 0) {
      const left = part.slice(0, dash).trim();
      const right = part.slice(dash + 1).trim();
      if (!isDigits(left) || !isDigits(right)) continue;

      let startLine = Number(left);
      let endLine = Number(right);

      if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) continue;
      if (startLine > endLine) [startLine, endLine] = [endLine, startLine];

      for (let k = startLine; k <= endLine; k++) set.add(k);
    } else {
      if (!isDigits(part)) continue;
      const x = Number(part);
      if (Number.isFinite(x)) set.add(x);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

const DEFAULT_KEYMAP = {
  title: ["title"],
  filename: ["filename", "file", "name"],
  lineNumbers: ["linenumbers", "line-numbers", "linenos"],
  pinned: ["pinned"],
  collapsed: ["collapsed"],
} satisfies Record<KnownKey, string[]>;

export function normalize(meta: FenceInfo, options: NormalizeOptions = {}): NormalizedMeta {
  const lowercaseKeys = options.lowercaseKeys ?? true;
  const mergeHighlightAttr = options.mergeHighlightAttr ?? true;
  const keyMap: Record<KnownKey, string[]> = { ...DEFAULT_KEYMAP, ...options.keyMap };

  const out: NormalizedMeta = { highlight: [...meta.highlight], attrs: {} };
  if (meta.lang) out.lang = meta.lang;

  const canonical = new Map<string, KnownKey>();
  for (const k of Object.keys(keyMap) as KnownKey[]) {
    for (const a of keyMap[k]) canonical.set(a.toLowerCase(), k);
  }

  let extraHighlight: number[] = [];
  for (const [rawKey, val] of Object.entries(meta.attrs)) {
    const lcKey = rawKey.toLowerCase();
    if (mergeHighlightAttr && (lcKey === "highlight" || lcKey === "lines" || lcKey === "hl")) {
      extraHighlight = parseLineSpec(val);
      continue;
    }

    const canon = canonical.get(lcKey);
    if (canon === "lineNumbers") {
      out.lineNumbers = coerceBool(val);
      continue;
    }

    if (canon === "title" || canon === "filename") {
      out[canon] = typeof val === "string" ? val : String(val);
      continue;
    }

    if (canon === "pinned" || canon === "collapsed") {
      out[canon] = coerceBool(val);
      continue;
    }

    const outKey = lowercaseKeys ? lcKey : rawKey;
    out.attrs[outKey] = val;
  }

  if (extraHighlight.length) {
    const set = new Set<number>(out.highlight);
    for (const x of extraHighlight) set.add(x);
    out.highlight = Array.from(set).sort((a, b) => a - b);
  }

  return out;
}
