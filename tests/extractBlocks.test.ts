import { describe, it, expect } from 'vitest'
import { extractBlocks, parseBlocks } from '../src/utils.js'

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
