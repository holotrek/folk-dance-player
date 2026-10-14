// Drawn transport icons. Characters like ⏸ and ⏹ render as colored emoji on macOS while ▶ doesn't,
// so the buttons wouldn't match; these SVGs look the same everywhere and follow the text color.

type IconProps = { size?: number }

function Icon({ size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

export const PlayIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M7 4.5v15l12.5-7.5z" />
  </Icon>
)

export const PauseIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="6" y="4.5" width="4.5" height="15" rx="1" />
    <rect x="13.5" y="4.5" width="4.5" height="15" rx="1" />
  </Icon>
)

export const StopIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
  </Icon>
)

// ◀◀: restart the song.
export const RestartIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 5v14L3 12zM21 5v14l-9-7z" />
  </Icon>
)

// ▶▶: the next item.
export const NextIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M3 5v14l9-7zM12 5v14l9-7z" />
  </Icon>
)

// ⌄: points down at the dance that will be taught (the projector's Teaching row).
export const ChevronDownIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4.5 8.5 12 16l7.5-7.5-1.8-1.8L12 12.4 6.3 6.7z" />
  </Icon>
)
