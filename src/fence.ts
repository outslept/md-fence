export type Scalar = string | number | boolean

export interface FenceInfo {
  lang?: string
  attrs: Record<string, Scalar>
  highlight: number[]
}

export interface ParseOptions {
  lowerCaseKeys?: boolean
  treatFirstBareAsLang?: boolean
}

export class TinyFenceError extends Error {
  constructor (msg: string) {
    super(msg)
    Object.setPrototypeOf(this, TinyFenceError.prototype)
  }
}

export function parseInfo (info: string, opts: ParseOptions = {}): FenceInfo {
  const lowerCaseKeys = opts.lowerCaseKeys ?? true
  const treatFirstBareAsLang = opts.treatFirstBareAsLang ?? true

  let i = 0
  const s = info
  const n = s.length

  let lang: string | undefined
  const attrs: Record<string, Scalar> = {}
  const hl = new Set<number>()
  let sawBareToken = false

  const isSpace = (c?: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r'
  const isDigit = (c?: string) => c !== undefined && c >= '0' && c <= '9'
  const skipWS = () => { while (i < n && isSpace(s[i])) i++ }

  function readQuoted (quote: '"' | "'"): string {
    i++
    let out = ''
    while (i < n) {
      const c = s[i++]
      if (c === '\\') {
        if (i >= n) throw new TinyFenceError('unterminated escape')
        const e = s[i++]
        switch (e) {
          case 'n': out += '\n'; break
          case 'r': out += '\r'; break
          case 't': out += '\t'; break
          case '"': out += '"'; break
          case "'": out += "'"; break
          case '\\': out += '\\'; break
          default: out += e; break
        }
      } else if (c === quote) {
        return out
      } else {
        out += c
      }
    }
    throw new TinyFenceError('unterminated string')
  }

  function readBare (): string {
    const start = i
    while (i < n) {
      const c = s[i]
      if (isSpace(c) || c === '=' || c === '{' || c === '}') break
      i++
    }
    return s.slice(start, i)
  }

  function coerce (raw: string, fromQuoted: boolean): Scalar {
    if (fromQuoted) return raw
    const l = raw.toLowerCase()
    if (l === 'true') return true
    if (l === 'false') return false
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      const num = Number(raw)
      if (Number.isFinite(num)) return num
    }
    return raw
  }

  function expectDigit (): number {
    if (!isDigit(s[i])) throw new TinyFenceError(`expected digit at ${i}`)
    const start = i
    while (isDigit(s[i])) i++
    return parseInt(s.slice(start, i), 10)
  }

  function parseHighlightBlock (): void {
    i++
    skipWS()
    let needValue = true
    while (i < n) {
      if (s[i] === '}') { i++; return }
      if (s[i] === ',') {
        if (needValue) throw new TinyFenceError('trailing comma in highlight block')
        i++
        skipWS()
        needValue = true
        continue
      }
      const start = expectDigit()
      let end = start
      skipWS()
      if (s[i] === '-') {
        i++
        skipWS()
        end = expectDigit()
      }
      for (let k = Math.min(start, end); k <= Math.max(start, end); k++) hl.add(k)
      skipWS()
      needValue = false
    }
    throw new TinyFenceError('unterminated highlight block')
  }

  function readValue (): Scalar {
    skipWS()
    if (s[i] === '"' || s[i] === "'") return readQuoted(s[i] as '"' | "'")
    const raw = readBare()
    return coerce(raw, false)
  }

  skipWS()
  while (i < n) {
    if (s[i] === '{') {
      parseHighlightBlock()
      skipWS()
      continue
    }

    const token = readBare()
    if (!token) {
      if (s[i] === '}') throw new TinyFenceError(`unexpected '}' at ${i}`)
      if (s[i] === '=') throw new TinyFenceError(`unexpected '=' at ${i}`)
      if (i < n) i++
      skipWS()
      continue
    }

    skipWS()
    if (s[i] === '=') {
      i++
      const value = readValue()
      const key = lowerCaseKeys ? token.toLowerCase() : token
      attrs[key] = value
      skipWS()
      continue
    }

    const firstBare = !sawBareToken
    if (firstBare && treatFirstBareAsLang) {
      lang = token
    } else {
      const key = lowerCaseKeys ? token.toLowerCase() : token
      attrs[key] = true
    }
    sawBareToken = true
    skipWS()
  }

  const base = { attrs, highlight: Array.from(hl).sort((a, b) => a - b) }
  return lang !== undefined ? { ...base, lang } : base
}

export interface FenceBlock {
  info: string
  code: string
}

export function extractBlocks (md: string): FenceBlock[] {
  const re = /(^|\r?\n)[ \t]{0,3}(```+|~~~+)([^\r\n]*)\r?\n([\s\S]*?)\r?\n\2(?=\r?\n|$)/g
  const out: FenceBlock[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const [, , , infoRaw = '', code = ''] = m
    out.push({ info: infoRaw.trim(), code })
  }
  return out
}

export function parseBlocks (md: string, opts?: ParseOptions) {
  return extractBlocks(md).map(b => ({ ...b, meta: parseInfo(b.info, opts) }))
}

export function parseLineSpec (v: string | number | boolean): number[] {
  if (typeof v === 'number' && Number.isFinite(v)) return [Math.trunc(v)]
  if (typeof v !== 'string') return []
  const set = new Set<number>()
  const parts = v.split(',').map(p => p.trim()).filter(Boolean)
  const isDigits = (s: string) => /^\d+$/.test(s)
  for (const part of parts) {
    const dash = part.indexOf('-')
    if (dash >= 0) {
      const left = part.slice(0, dash).trim()
      const right = part.slice(dash + 1).trim()
      if (!isDigits(left) || !isDigits(right)) continue
      let a = Number(left); let b = Number(right)
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      if (a > b) [a, b] = [b, a]
      for (let k = a; k <= b; k++) set.add(k)
    } else {
      if (!isDigits(part)) continue
      const x = Number(part)
      if (Number.isFinite(x)) set.add(x)
    }
  }
  return Array.from(set).sort((a, b) => a - b)
}

export interface NormalizeOptions {
  lowercaseKeys?: boolean
  mergeHighlightAttr?: boolean
  keyMap?: Partial<Record<'title' | 'filename' | 'lineNumbers' | 'pinned' | 'collapsed', string[]>>
}

export interface NormalizedMeta {
  lang?: string
  highlight: number[]
  title?: string
  filename?: string
  lineNumbers?: boolean
  pinned?: boolean
  collapsed?: boolean
  attrs: Record<string, Scalar>
}

const DEFAULT_KEYMAP = {
  title: ['title'],
  filename: ['filename', 'file', 'name'],
  lineNumbers: ['linenumbers', 'line-numbers', 'linenos'],
  pinned: ['pinned'],
  collapsed: ['collapsed'],
} as const

export function normalize (meta: FenceInfo, options: NormalizeOptions = {}): NormalizedMeta {
  const lowercaseKeys = options.lowercaseKeys ?? true
  const mergeHighlightAttr = options.mergeHighlightAttr ?? true
  const keyMap = { ...DEFAULT_KEYMAP, ...options.keyMap }

  const out: NormalizedMeta = { highlight: [...meta.highlight], attrs: {} }
  if (meta.lang) out.lang = meta.lang

  const canonical = new Map<string, 'title' | 'filename' | 'lineNumbers' | 'pinned' | 'collapsed'>()
  for (const [canon, alts] of Object.entries(keyMap) as [typeof canonical extends Map<any, infer V> ? V : never, string[]][]) {
    for (const a of alts) canonical.set(a.toLowerCase(), canon as any)
  }

  let extraHighlight: number[] = []
  for (const [rawKey, val] of Object.entries(meta.attrs)) {
    const lcKey = rawKey.toLowerCase()
    if (mergeHighlightAttr && (lcKey === 'highlight' || lcKey === 'lines' || lcKey === 'hl')) {
      extraHighlight = parseLineSpec(val)
      continue
    }
    const canon = canonical.get(lcKey)
    if (canon === 'lineNumbers') {
      if (typeof val === 'boolean') out.lineNumbers = val
      else if (typeof val === 'number') out.lineNumbers = !!val
      else if (typeof val === 'string') out.lineNumbers = val.toLowerCase() !== 'false'
      continue
    }
    if (canon === 'title' || canon === 'filename') {
      ;(out as any)[canon] = typeof val === 'string' ? val : String(val)
      continue
    }
    if (canon === 'pinned' || canon === 'collapsed') {
      ;(out as any)[canon] = typeof val === 'boolean' ? val : String(val).toLowerCase() !== 'false'
      continue
    }
    const outKey = lowercaseKeys ? lcKey : rawKey
    out.attrs[outKey] = val
  }

  if (extraHighlight.length) {
    const set = new Set<number>(out.highlight)
    for (const x of extraHighlight) set.add(x)
    out.highlight = Array.from(set).sort((a, b) => a - b)
  }

  return out
}
