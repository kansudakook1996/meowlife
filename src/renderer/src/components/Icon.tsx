/** Simple outline icons (stroke = currentColor) so the menu looks tidy and adult, not emoji-cute. */
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  ledger: 'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4',
  repeat: 'M17 3l4 4-4 4 M3 11V9a2 2 0 0 1 2-2h16 M7 21l-4-4 4-4 M21 13v2a2 2 0 0 1-2 2H3',
  chart: 'M3 3v18h18 M7 15l4-4 3 3 5-6',
  tag: 'M3 3h8l10 10-8 8L3 11z M7.5 7.5h.01',
  archive: 'M4 4h13l3 3v13H4z M8 4v5h8V4 M8 20v-6h8v6',
  card: 'M3 6h18v12H3z M3 10h18 M7 15h4',
  calendar: 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',
  tasks: 'M4 4h16v16H4z M8 12l3 3 5-6',
  journal: 'M6 3h12v18H6z M6 7H4 M6 12H4 M6 17H4 M10 8h5',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  sprout: 'M12 21v-9 M12 12c0-4 3-6 7-6 0 4-3 6-7 6z M12 15c0-3-2-5-6-5 0 3 2 5 6 5z',
  note: 'M5 3h14v12l-6 6H5z M13 21v-6h6 M9 8h6',
  bars: 'M5 21V10 M12 21V4 M19 21v-7',
  cat: 'M5 4l3.5 3h7L19 4v9a7 7 0 0 1-14 0z M9.5 12h.01 M14.5 12h.01 M10 16c1 .8 3 .8 4 0',
  sliders: 'M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  plus: 'M12 5v14 M5 12h14'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}
