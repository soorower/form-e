/** A copy of `items` with the element at `from` moved to `to`; unchanged when either is out of range. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** A copy of `items` with `item` placed at `index`, clamped to the ends of the list. */
export function insertAt<T>(items: T[], index: number, item: T): T[] {
  const at = Math.max(0, Math.min(index, items.length))
  return [...items.slice(0, at), item, ...items.slice(at)]
}
