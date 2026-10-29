/**
 * "เจ๊หมี" (white) and "อาจารย์ส้ม" (orange tabby) — MeowLife's mascots, drawn as inline SVG (works offline).
 * Style follows the owner's app icon: flat shapes, no outlines, big eyes with a yellow ring, ":3" mouths.
 */
export type CatMood = 'happy' | 'sleepy' | 'cheer' | 'worried'

interface Props {
  mood?: CatMood
  size?: number
  /** Accessible description. Leave empty when the cats are purely decorative. */
  label?: string
}

export function CatMascot({ mood = 'happy', size = 96, label }: Props): React.JSX.Element {
  const decorative = !label
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 160 120"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label}
    >
      {/* orange cat (behind) */}
      <g>
        <path d="M86 40 L90 12 L108 30 Z" fill="var(--cat-orange)" />
        <path d="M134 34 L142 8 L148 38 Z" fill="var(--cat-orange)" />
        <path d="M91 30 L93 18 L102 28 Z" fill="var(--cat-ear)" />
        <path d="M138 30 L142 16 L144 33 Z" fill="var(--cat-ear)" />
        <ellipse cx="118" cy="92" rx="34" ry="26" fill="var(--cat-orange)" />
        <ellipse cx="118" cy="56" rx="34" ry="29" fill="var(--cat-orange)" />
        <path d="M110 30 Q112 38 109 44 M120 28 Q121 36 119 42 M130 31 Q129 38 131 44" fill="none" stroke="var(--cat-orange-stripe)" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M148 58 Q144 60 145 64 M150 68 Q145 70 146 74" fill="none" stroke="var(--cat-orange-stripe)" strokeWidth="3" strokeLinecap="round" />
        <Face cx={118} cy={58} mood={mood} />
      </g>

      {/* white cat (front) */}
      <g>
        <path d="M18 44 L16 12 L40 30 Z" fill="var(--cat-white)" stroke="var(--cat-white-shade)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M66 32 L74 6 L84 40 Z" fill="var(--cat-white)" stroke="var(--cat-white-shade)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M21 34 L20 20 L32 30 Z" fill="var(--cat-ear)" />
        <path d="M71 28 L75 14 L79 34 Z" fill="var(--cat-ear)" />
        <ellipse cx="50" cy="94" rx="34" ry="24" fill="var(--cat-white-shade)" />
        <ellipse cx="50" cy="56" rx="36" ry="30" fill="var(--cat-white)" stroke="var(--cat-white-shade)" strokeWidth="1.5" />
        <Face cx={50} cy={58} mood={mood} />
      </g>

      {/* cushion + paws */}
      <path d="M4 104 Q80 86 156 104 L156 120 L4 120 Z" fill="var(--cream)" stroke="var(--yellow-300)" strokeWidth="2" />
      <ellipse cx="34" cy="100" rx="11" ry="7" fill="var(--cat-white)" stroke="var(--cat-white-shade)" strokeWidth="1.5" />
      <ellipse cx="64" cy="98" rx="11" ry="7" fill="var(--cat-white)" stroke="var(--cat-white-shade)" strokeWidth="1.5" />
      <ellipse cx="102" cy="98" rx="11" ry="7" fill="var(--cat-orange)" />
      <ellipse cx="134" cy="100" rx="11" ry="7" fill="var(--cat-orange)" />

      {mood === 'cheer' && (
        <g fill="var(--yellow-300)" stroke="var(--yellow-600)" strokeWidth="1">
          <path d="M84 8 l2.5 5 5.5 1 -4 3.5 1 5.5 -5 -2.7 -5 2.7 1 -5.5 -4 -3.5 5.5 -1 z" />
          <path d="M6 54 l2 4 4 0.8 -3 2.8 0.8 4 -3.8 -2 -3.8 2 0.8 -4 -3 -2.8 4 -0.8 z" />
        </g>
      )}
      {mood === 'sleepy' && (
        <text x="140" y="16" fontFamily="var(--font-display)" fontSize="13" fill="var(--blue-600)">
          z z
        </text>
      )}
    </svg>
  )
}

function Face({ cx, cy, mood }: { cx: number; cy: number; mood: CatMood }): React.JSX.Element {
  const line = { fill: 'none', stroke: 'var(--cat-eye)', strokeWidth: 2.6, strokeLinecap: 'round' as const }
  const lx = cx - 13
  const rx = cx + 13
  return (
    <g>
      {mood === 'sleepy' ? (
        <>
          <path d={`M${lx - 6} ${cy - 2} Q${lx} ${cy + 3} ${lx + 6} ${cy - 2}`} {...line} />
          <path d={`M${rx - 6} ${cy - 2} Q${rx} ${cy + 3} ${rx + 6} ${cy - 2}`} {...line} />
        </>
      ) : mood === 'cheer' ? (
        <>
          <path d={`M${lx - 6} ${cy} Q${lx} ${cy - 8} ${lx + 6} ${cy}`} {...line} />
          <path d={`M${rx - 6} ${cy} Q${rx} ${cy - 8} ${rx + 6} ${cy}`} {...line} />
        </>
      ) : (
        <>
          <circle cx={lx} cy={cy - 2} r="7.5" fill="var(--cat-eye-ring)" />
          <circle cx={rx} cy={cy - 2} r="7.5" fill="var(--cat-eye-ring)" />
          <circle cx={lx + 0.8} cy={cy - 2} r="5.8" fill="var(--cat-eye)" />
          <circle cx={rx + 0.8} cy={cy - 2} r="5.8" fill="var(--cat-eye)" />
          <circle cx={lx + 2.4} cy={cy - 4} r="1.6" fill="#fff" />
          <circle cx={rx + 2.4} cy={cy - 4} r="1.6" fill="#fff" />
          {mood === 'worried' && (
            <>
              <path d={`M${lx - 7} ${cy - 13} L${lx + 4} ${cy - 11}`} {...line} strokeWidth={2.2} />
              <path d={`M${rx + 7} ${cy - 13} L${rx - 4} ${cy - 11}`} {...line} strokeWidth={2.2} />
            </>
          )}
        </>
      )}
      {/* nose + ":3" mouth */}
      <path d={`M${cx - 3} ${cy + 5} L${cx + 3} ${cy + 5} L${cx} ${cy + 8} Z`} fill="var(--cat-eye)" />
      {mood === 'worried' ? (
        <path d={`M${cx - 5} ${cy + 14} Q${cx} ${cy + 10} ${cx + 5} ${cy + 14}`} {...line} strokeWidth={2.2} />
      ) : (
        <path d={`M${cx - 6} ${cy + 10} Q${cx - 3} ${cy + 14} ${cx} ${cy + 10} Q${cx + 3} ${cy + 14} ${cx + 6} ${cy + 10}`} {...line} strokeWidth={2.2} />
      )}
      {/* whiskers */}
      <g stroke="var(--cat-eye)" strokeWidth="1.8" strokeLinecap="round">
        <line x1={cx - 34} y1={cy + 6} x2={cx - 22} y2={cy + 8} />
        <line x1={cx - 33} y1={cy + 13} x2={cx - 22} y2={cy + 11} />
        <line x1={cx + 34} y1={cy + 6} x2={cx + 22} y2={cy + 8} />
        <line x1={cx + 33} y1={cy + 13} x2={cx + 22} y2={cy + 11} />
      </g>
    </g>
  )
}
