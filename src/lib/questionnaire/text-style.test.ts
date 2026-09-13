import { describe, expect, it } from 'vitest'
import { resolveTextStyle, textStyleClass, updateTextStyle } from './text-style'

describe('text styles', () => {
  it('layers the author style over the element defaults', () => {
    expect(resolveTextStyle(undefined, { bold: true, align: 'center' })).toEqual({
      bold: true,
      italic: false,
      underline: false,
      align: 'center',
    })
    expect(resolveTextStyle({ bold: false, italic: true }, { bold: true })).toMatchObject({
      bold: false,
      italic: true,
      align: 'left',
    })
  })

  it('always emits a weight so a default-bold title can be made normal', () => {
    expect(textStyleClass(undefined, { bold: true })).toBe('font-bold text-left')
    expect(textStyleClass({ bold: false, align: 'center' }, { bold: true })).toBe(
      'font-normal text-center',
    )
    expect(textStyleClass({ italic: true, underline: true, align: 'justify' })).toBe(
      'font-normal italic underline underline-offset-4 text-justify',
    )
  })

  it('stores only fields that differ from the default', () => {
    expect(updateTextStyle(undefined, { bold: true }, { bold: true })).toBeUndefined()
    expect(updateTextStyle(undefined, { bold: false }, { bold: true })).toEqual({ bold: false })
    expect(updateTextStyle({ italic: true }, { align: 'center' })).toEqual({
      italic: true,
      align: 'center',
    })
    expect(updateTextStyle({ italic: true }, { italic: false })).toBeUndefined()
  })
})
