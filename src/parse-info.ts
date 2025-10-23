import { type FenceInfo, type ParseOptions, type Scalar, TinyFenceError } from './types.js'

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
