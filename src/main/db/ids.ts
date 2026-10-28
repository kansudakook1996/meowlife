import { createHash } from 'node:crypto'

/**
 * UUID (v5-style) derived from a key, so every device produces the same id for "the same thing"
 * (a month's bill, a day's journal page, one habit tick) and sync never creates duplicates.
 */
export function deterministicId(key: string): string {
  const h = createHash('sha1').update(key).digest()
  h[6] = ((h[6] as number) & 0x0f) | 0x50
  h[8] = ((h[8] as number) & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}