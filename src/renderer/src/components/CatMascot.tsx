/**
 * "โมจิ" — MeowLife's original mascot, drawn for this project as inline SVG (works offline).
 */
export type CatMood = 'happy' | 'sleepy' | 'cheer' | 'worried'

interface Props {
  mood?: CatMood
  size?: number
  /** Accessible description. Leave empty when the cat is purely decorative. */
  label?: string
}

export function CatMascot({ mood = 'happy', size = 96, label }: Props): React.JSX.Element {
  const decorative = !label
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label}
    >
      {/* tail */}
      <path
        className="cat-tail"
        d="M24 92 C6 86 8 62 22 66"
        fill="none"
        stroke="var(--cat-line)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path className="cat-tail" d="M24 92 C6 86 8 62 22 66" fill="none" stroke="var(--pink-300)" strokeWidth="4" strokeLinecap="round" />
      {/* body */}
      <ellipse cx="60" cy="92" rx="34" ry="22" fill="var(--cat-fur)" stroke="var(--cat-line)" strokeWidth="3" />
      <ellipse cx="46" cy="110" rx="9" ry="6" fill="var(--cat-fur)" stroke="var(--cat-line)" strokeWidth="3" />
      <ellipse cx="74" cy="110" rx="9" ry="6" fill="var(--cat-fur)" stroke="var(--cat-line)" strokeWidth="3" />
      {/* ears */}
      <path d="M28 40 L26 10 L52 28 Z" fill="var(--cat-fur)" stroke="var(--cat-line)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M92 40 L94 10 L68 28 Z" fill="var(--cat-fur)" stroke="var(--cat-line)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 32 L31 18 L44 27 Z" fill="var(--pink-300)" />
      <path d="M88 32 L89 18 L76 27 Z" fill="var(--pink-300)" />
      {/* head */}
      <ellipse cx="60" cy="52" rx="38" ry="30" fill="var(--cat-fur)" stroke="var(--cat-line)" strokeWidth="3" />
      {/* forehead patch */}
      <path d="M52 24 Q60 34 68 24" fill="none" stroke="var(--yellow-300)" strokeWidth="5" strokeLinecap="round" />
      {/* collar + bell */}
      <path d="M32 76 Q60 88 88 76" fill="none" stroke="var(--pink-500)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="60" cy="84" r="6" fill="var(--yellow-300)" stroke="var(--cat-line)" strokeWidth="2" />
      <line x1="56" y1="85" x2="64" y2="85" stroke="var(--cat-line)" strokeWidth="1.5" />
      <Eyes mood={mood} />
      {/* blush */}
      <ellipse cx="36" cy="62" rx="7" ry="4" fill="var(--pink-300)" opacity="0.8" />
      <ellipse cx="84" cy="62" rx="7" ry="4" fill="var(--pink-300)" opacity="0.8" />
      {/* nose + mouth */}
      <path d="M56 58 L64 58 L60 62 Z" fill="var(--pink-500)" />
      {mood === 'worried' ? (
        <path d="M53 69 Q60 64 67 69" fill="none" stroke="var(--cat-line)" strokeWidth="2.5" strokeLinecap="round" />
      ) : (
        <path d="M52 64 Q56 69 60 64 Q64 69 68 64" fill="none" stroke="var(--cat-line)" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* whiskers */}
      <g stroke="var(--cat-line)" strokeWidth="1.8" strokeLinecap="round">
        <line x1="14" y1="54" x2="30" y2="57" />
        <line x1="14" y1="63" x2="30" y2="61" />
        <line x1="106" y1="54" x2="90" y2="57" />
        <line x1="106" y1="63" x2="90" y2="61" />
      </g>
      {mood === 'cheer' && (
        <g fill="var(--yellow-300)" stroke="var(--yellow-600)" strokeWidth="1">
          <path d="M104 22 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1 z" />
          <path d="M12 26 l2 4 4 1 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -1 z" />
        </g>
      )}
      {mood === 'sleepy' && (
        <text x="92" y="24" fontFamily="var(--font-display)" fontSize="14" fill="var(--blue-600)">
          z z
        </text>
      )}
    </svg>
  )
}

function Eyes({ mood }: { mood: CatMood }): React.JSX.Element {
  const line = { fill: 'none', stroke: 'var(--cat-line)', strokeWidth: 3, strokeLinecap: 'round' as const }
  switch (mood) {
    case 'sleepy':
      return (
        <g>
          <path d="M40 50 Q46 54 52 50" {...line} />
          <path d="M68 50 Q74 54 80 50" {...line} />
        </g>
      )
    case 'cheer':
      return (
        <g>
          <path d="M40 52 Q46 44 52 52" {...line} />
          <path d="M68 52 Q74 44 80 52" {...line} />
        </g>
      )
    case 'worried':
      return (
        <g>
          <circle cx="46" cy="50" r="4.5" fill="var(--cat-line)" />
          <circle cx="74" cy="50" r="4.5" fill="var(--cat-line)" />
          <path d="M39 40 L51 43" {...line} strokeWidth={2.5} />
          <path d="M81 40 L69 43" {...line} strokeWidth={2.5} />
        </g>
      )
    case 'happy':
      return (
        <g>
          <circle cx="46" cy="50" r="5" fill="var(--cat-line)" />
          <circle cx="74" cy="50" r="5" fill="var(--cat-line)" />
          <circle cx="47.5" cy="48.5" r="1.6" fill="#fff" />
          <circle cx="75.5" cy="48.5" r="1.6" fill="#fff" />
        </g>
      )
  }
}
