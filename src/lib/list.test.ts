import { describe, expect, it } from 'vitest'
import { insertAt, moveItem } from './list'

describe('moveItem', () => {
  it('moves an element up or down and leaves the input untouched', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns the same list for a no-op or an out-of-range move', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 1, 1)).toBe(items)
    expect(moveItem(items, 0, 2)).toBe(items)
    expect(moveItem(items, -1, 0)).toBe(items)
  })
})

describe('insertAt', () => {
  it('inserts between existing elements and clamps to the ends', () => {
    expect(insertAt(['a', 'b', 'c'], 1, 'x')).toEqual(['a', 'x', 'b', 'c'])
    expect(insertAt(['a'], 0, 'x')).toEqual(['x', 'a'])
    expect(insertAt(['a'], 9, 'x')).toEqual(['a', 'x'])
    expect(insertAt([], -3, 'x')).toEqual(['x'])
  })
})
