import type { FenceBlock, FenceInfo, KnownKey, NormalizeOptions, NormalizedMeta, ParseOptions, Scalar } from './types.js'
import { parseInfo } from './parse-info.js'

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

export function parseBlocks (md: string, opts?: ParseOptions): Array<FenceBlock & { meta: FenceInfo }> {
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

const DEFAULT_KEYMAP: Record<KnownKey, string[]> = {
  title: ['title'],
  filename: ['filename', 'file', 'name'],
  lineNumbers: ['linenumbers', 'line-numbers', 'linenos'],
  pinned: ['pinned'],
  collapsed: ['collapsed'],
}

export function normalize (meta: FenceInfo, options: NormalizeOptions = {}): NormalizedMeta {
  const lowercaseKeys = options.lowercaseKeys ?? true
  const mergeHighlightAttr = options.mergeHighlightAttr ?? true
  const keyMap: Record<KnownKey, string[]> = { ...DEFAULT_KEYMAP, ...(options.keyMap ?? {}) }

  const out: NormalizedMeta = { highlight: [...meta.highlight], attrs: {} }
  if (meta.lang) out.lang = meta.lang

  const canonical = new Map<string, KnownKey>()
  for (const k of Object.keys(keyMap) as KnownKey[]) {
    for (const a of keyMap[k]) canonical.set(a.toLowerCase(), k)
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
    ;(out.attrs as Record<string, Scalar>)[outKey] = val
  }

  if (extraHighlight.length) {
    const set = new Set<number>(out.highlight)
    for (const x of extraHighlight) set.add(x)
    out.highlight = Array.from(set).sort((a, b) => a - b)
  }

  return out
}
