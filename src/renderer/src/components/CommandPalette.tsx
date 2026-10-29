import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'

export interface PaletteItem {
  id: string
  label: string
  /** Short grey text on the right: "ไปที่หน้า", "เพิ่ม" … */
  hint: string
  run: () => void
}

/**
 * Ctrl+K: type a few letters, press Enter. Jump to any page, add an item, or search the ledger.
 * Fully keyboard-driven (↑ ↓ Enter Esc) and announced as a listbox.
 */
export function CommandPalette(props: {
  open: boolean
  items: PaletteItem[]
  onClose: () => void
  onSearchLedger: (text: string) => void
}): React.JSX.Element {
  return (
    <Modal open={props.open} title="ค้นหา / สั่งงาน" onClose={props.onClose}>
      {props.open && <PaletteBody {...props} />}
    </Modal>
  )
}

function PaletteBody({ items, onClose, onSearchLedger }: { items: PaletteItem[]; onClose: () => void; onSearchLedger: (t: string) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const shown = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLocaleLowerCase('th')
    if (!q) return items
    // Best match first: labels that START with what was typed, then the ones that merely contain it.
    const lower = (i: PaletteItem): string => i.label.toLocaleLowerCase('th')
    const matches = [...items.filter((i) => lower(i).startsWith(q)), ...items.filter((i) => !lower(i).startsWith(q) && lower(i).includes(q))]
    return [...matches, { id: 'search-ledger', label: `ค้นหา "${query.trim()}" ในรายการรับ-จ่าย`, hint: 'ค้นหา', run: () => onSearchLedger(query.trim()) }]
  }, [items, query, onSearchLedger])

  const current = Math.min(index, shown.length - 1)

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const choose = (item: PaletteItem | undefined): void => {
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <div className="form">
      <label className="visually-hidden" htmlFor="palette-input">พิมพ์เพื่อค้นหาหน้าหรือคำสั่ง</label>
      <input
        id="palette-input"
        className="input"
        autoFocus
        autoComplete="off"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={shown[current] ? `palette-${shown[current].id}` : undefined}
        placeholder="พิมพ์ชื่อหน้า หรือคำสั่ง เช่น “บัตร” “เพิ่มรายจ่าย” “ปฏิทิน”"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIndex((i) => Math.min(shown.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            choose(shown[current])
          }
        }}
      />
      <ul id="palette-list" ref={listRef} role="listbox" aria-label="ผลลัพธ์" className="palette-list">
        {shown.map((item, i) => (
          <li
            key={item.id}
            id={`palette-${item.id}`}
            role="option"
            aria-selected={i === current}
            className="palette-item"
            onMouseEnter={() => setIndex(i)}
            onClick={() => choose(item)}
          >
            <span>{item.label}</span>
            <span className="muted small">{item.hint}</span>
          </li>
        ))}
        {shown.length === 0 && <li className="muted palette-item">ไม่พบ ลองพิมพ์คำอื่นนะ</li>}
      </ul>
      <p className="muted small">↑ ↓ เลือก · Enter เปิด · Esc ปิด</p>
    </div>
  )
}
