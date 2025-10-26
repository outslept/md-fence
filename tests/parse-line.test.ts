import { describe, it, expect } from 'vitest'
import { parseLineSpec } from '../src/utils.js'

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
