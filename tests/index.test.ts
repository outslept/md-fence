import { describe, it, expect } from 'vitest'
import { extractBlocks, parseBlocks, parseLineSpec, parseInfo, normalize } from '../src/index.js'
import type { FenceInfo } from '../src/index.js'

describe('extractBlocks', () => {
  it('extracts backtick fenced blocks with info and code', () => {
    const md = [
      'before',
      '```js title="X"',
      'line1',
      'line2',
      '```',
      'after'
    ].join('\n')
    const blocks = extractBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.info).toBe('js title="X"')
    expect(blocks[0]?.code).toBe('line1\nline2')
  })

  it.skip('extracts tilde fenced blocks with Windows newlines', () => {
    const md = '~~~ py\r\nprint(123)\r\n~~~\r\n'
    const blocks = extractBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.info).toBe(' py')
    expect(blocks[0]?.code).toBe('print(123)')
  })

  it('allows up to 3 spaces indentation', () => {
    const md = [
      '   ```',
      'indented',
      '```'
    ].join('\n')
    const blocks = extractBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.code).toBe('indented')
  })

  it('does not match when indentation exceeds 3 spaces', () => {
    const md = [
      '    ```',
      'nope',
      '```'
    ].join('\n')
    const blocks = extractBlocks(md)
    expect(blocks).toHaveLength(0)
  })

  it('handles longer fences and inner shorter fences', () => {
    const md = [
      '````',
      '```',
      'inner',
      '```',
      '````'
    ].join('\n')
    const blocks = extractBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.code).toBe('```\ninner\n```')
  })

  it('matches EOF without trailing newline', () => {
    const md = '```text\nabc\n```'
    const blocks = extractBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.info).toBe('text')
    expect(blocks[0]?.code).toBe('abc')
  })
})

describe('parseBlocks', () => {
  it('parses meta for each block', () => {
    const md = [
      '```ts title="Hello" {1,3-4}',
      'code',
      '```',
      '',
      '~~~',
      'other',
      '~~~'
    ].join('\n')
    const blocks = parseBlocks(md)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.meta.lang).toBe('ts')
    expect(blocks[0]?.meta.highlight).toEqual([1, 3, 4])
    expect(blocks[0]?.meta.attrs).toMatchObject({ title: 'Hello' })
    expect(blocks[1]?.meta.highlight).toEqual([])
    expect(blocks[1]?.meta.attrs).toEqual({})
  })
})

describe('normalize', () => {
  it('merges highlight from attr aliases and canonicalizes keys', () => {
    const meta: FenceInfo = {
      lang: 'ts',
      highlight: [5],
      attrs: {
        lines: '1-3',
        linenumbers: 'false',
        file: 'x.ts',
        pinned: '0',
        collapsed: 'TRUE',
        ttl: 123,
        keepMe: 'v',
        MIXED: 1
      }
    }
    const out = normalize(meta, {
      keyMap: { title: ['title', 'ttl'] },
      lowercaseKeys: false
    })
    expect(out.lang).toBe('ts')
    expect(out.highlight).toEqual([1, 2, 3, 5])
    expect(out.lineNumbers).toBe(false)
    expect(out.filename).toBe('x.ts')
    expect(out.pinned).toBe(false)
    expect(out.collapsed).toBe(true)
    expect(out.title).toBe('123')
    expect(out.attrs.keepMe).toBe('v')
    expect(out.attrs.MIXED).toBe(1)
    expect(out.attrs.lines).toBeUndefined()
  })

  it('respects mergeHighlightAttr=false', () => {
    const meta: FenceInfo = {
      highlight: [2],
      attrs: { hl: '3' }
    }
    const out = normalize(meta, { mergeHighlightAttr: false })
    expect(out.highlight).toEqual([2])
    expect(out.attrs.hl).toBe('3')
  })

  it('handles lineNumbers as boolean and number', () => {
    const meta: FenceInfo = {
      highlight: [],
      attrs: { linenumbers: true }
    }
    const out1 = normalize(meta)
    expect(out1.lineNumbers).toBe(true)

    const meta2: FenceInfo = {
      highlight: [],
      attrs: { linenumbers: 0 }
    }
    const out2 = normalize(meta2)
    expect(out2.lineNumbers).toBe(false)
  })

  it('converts filename and title to strings', () => {
    const meta: FenceInfo = {
      highlight: [],
      attrs: { filename: 42, title: true }
    }
    const out = normalize(meta)
    expect(out.filename).toBe('42')
    expect(out.title).toBe('true')
  })
})

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
    expect(() => parseInfo(' } ')).toThrowError(Error)
    expect(() => parseInfo(' } ')).toThrowError(/unexpected '}'/)
  })

  it('unexpected =', () => {
    expect(() => parseInfo(' = ')).toThrowError(Error)
    expect(() => parseInfo(' = ')).toThrowError(/unexpected '='/)
  })

  it('expected digit in highlight', () => {
    expect(() => parseInfo('{a}')).toThrowError(Error)
    expect(() => parseInfo('{a}')).toThrowError(/expected digit at /)
  })

  it('trailing comma in highlight block', () => {
    expect(() => parseInfo('{,1}')).toThrowError(Error)
    expect(() => parseInfo('{,1}')).toThrowError(/trailing comma in highlight block/)
  })

  it('unterminated highlight block', () => {
    expect(() => parseInfo('{1,2')).toThrowError(Error)
    expect(() => parseInfo('{1,2')).toThrowError(/unterminated highlight block/)
  })

  it('unterminated string', () => {
    expect(() => parseInfo('x="hi')).toThrowError(Error)
    expect(() => parseInfo('x="hi')).toThrowError(/unterminated string/)
  })

  it('unterminated escape', () => {
    expect(() => parseInfo('x="hi\\')).toThrowError(Error)
    expect(() => parseInfo('x="hi\\')).toThrowError(/unterminated escape/)
  })
})

describe('parseLineSpec', () => {
  it('handles numbers directly', () => {
    expect(parseLineSpec(3)).toEqual([3])
    expect(parseLineSpec(3.7)).toEqual([3])
    expect(parseLineSpec(-2)).toEqual([-2])
  })

  it('returns empty for non-string non-number', () => {
    expect(parseLineSpec(true as any)).toEqual([])
  })

  it('parses lists, ranges, reversed ranges, zeros, and ignores junk', () => {
    expect(parseLineSpec('1, 2, 4-6, 6-4, 2, foo, 0, 10')).toEqual([0, 1, 2, 4, 5, 6, 10])
  })

  it('parses ranges with leading zeros and trims spaces', () => {
    expect(parseLineSpec('03 - 05, 1')).toEqual([1, 3, 4, 5])
  })
})
