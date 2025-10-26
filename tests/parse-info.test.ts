import { describe, it, expect } from 'vitest'
import { parseInfo } from '../src/parse-info.js'
import { TinyFenceError } from '../src/types.js'

describe('parseInfo', () => {
  it('parses language, attrs, types, and highlight ranges', () => {
    const info = `ts pinned collapsed=false num=42 float=3.5 truth=TRUE falsy=false e=12e3 f="34.5" bare {3-1, 2}`
    const res = parseInfo(info)
    expect(res.lang).toBe('ts')
    expect(res.highlight).toEqual([1, 2, 3])
    expect(res.attrs).toMatchObject({
      pinned: true,
      collapsed: false,
      num: 42,
      float: 3.5,
      truth: true,
      falsy: false,
      e: '12e3',
      f: '34.5',
      bare: true
    })
  })

  it('handles quoted escapes and unknown escapes', () => {
    const info = `lang d1="a\\nb\\tc\\\"d\\\\x" s1='y\\r\\t\\'z\\\\q'`
    const res = parseInfo(info)
    expect(res.lang).toBe('lang')
    expect(res.attrs.d1).toBe('a\nb\tc"d\\x')
    expect(res.attrs.s1).toBe("y\r\t'z\\q")
  })

  it('treatFirstBareAsLang=false makes bare tokens boolean', () => {
    const res = parseInfo('abc def', { treatFirstBareAsLang: false })
    expect(res.lang).toBeUndefined()
    expect(res.attrs).toMatchObject({ abc: true, def: true })
  })

  it('respects lowerCaseKeys=false for attr keys', () => {
    const res = parseInfo('JS Flag Extra=1', { lowerCaseKeys: false })
    expect(res.lang).toBe('JS')
    expect(res.attrs).toMatchObject({ Flag: true, Extra: 1 })
    expect(Object.keys(res.attrs)).toEqual(['Flag', 'Extra'])
  })

  it('supports multiple highlight blocks and whitespace', () => {
    const res = parseInfo('{ 1 - 3 , 5 } {7,7}')
    expect(res.highlight).toEqual([1, 2, 3, 5, 7])
  })

  it.skip('skips stray non-token characters', () => {
    const res = parseInfo(',a b')
    expect(res.lang).toBe('a')
    expect(res.attrs).toMatchObject({ b: true })
  })
})

describe('parseInfo errors', () => {
  it('unexpected }', () => {
    expect(() => parseInfo(' } ')).toThrowError(TinyFenceError)
    expect(() => parseInfo(' } ')).toThrowError(/unexpected '}'/)
  })

  it('unexpected =', () => {
    expect(() => parseInfo(' = ')).toThrowError(TinyFenceError)
    expect(() => parseInfo(' = ')).toThrowError(/unexpected '='/)
  })

  it('expected digit in highlight', () => {
    expect(() => parseInfo('{a}')).toThrowError(TinyFenceError)
    expect(() => parseInfo('{a}')).toThrowError(/expected digit at /)
  })

  it('trailing comma in highlight block', () => {
    expect(() => parseInfo('{,1}')).toThrowError(TinyFenceError)
    expect(() => parseInfo('{,1}')).toThrowError(/trailing comma in highlight block/)
  })

  it('unterminated highlight block', () => {
    expect(() => parseInfo('{1,2')).toThrowError(TinyFenceError)
    expect(() => parseInfo('{1,2')).toThrowError(/unterminated highlight block/)
  })

  it('unterminated string', () => {
    expect(() => parseInfo('x="hi')).toThrowError(TinyFenceError)
    expect(() => parseInfo('x="hi')).toThrowError(/unterminated string/)
  })

  it('unterminated escape', () => {
    expect(() => parseInfo('x="hi\\')).toThrowError(TinyFenceError)
    expect(() => parseInfo('x="hi\\')).toThrowError(/unterminated escape/)
  })
})
