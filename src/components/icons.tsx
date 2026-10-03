/**
 * Inline SVG icons.
 *
 * Deliberately not emoji: emoji render differently per platform and read as
 * clip-art against the letterpress type. These inherit `currentColor` and size
 * from the surrounding text.
 */

type IconProps = {
  className?: string;
  size?: number;
};

/**
 * Audio waveform — five bars. Reads as "voice" without a literal microphone,
 * and the bars can dance while the recogniser is live.
 */
export function WaveformIcon({
  className = "",
  size = 20,
  active = false,
}: IconProps & { active?: boolean }) {
  // Resting heights, tallest in the middle.
  const bars = [
    { x: 2, h: 6 },
    { x: 7, h: 12 },
    { x: 12, h: 18 },
    { x: 17, h: 11 },
    { x: 22, h: 7 },
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={(26 - b.h) / 2}
          width="2.5"
          height={b.h}
          rx="1.25"
          fill="currentColor"
          className={active ? "wave-bar" : undefined}
          style={active ? { animationDelay: `${i * 110}ms` } : undefined}
        />
      ))}
    </svg>
  );
}

export function StopIcon({ className = "", size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="4" y="4" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

/** Small four-point sparkle, used for the LLM deck builder. */
export function SparkIcon({ className = "", size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M8 0.75c.35 3.1 1.9 4.9 5.25 5.25-3.35.35-4.9 2.15-5.25 5.25-.35-3.1-1.9-4.9-5.25-5.25C6.1 5.65 7.65 3.85 8 .75Z"
        fill="currentColor"
      />
      <path
        d="M13.25 10.5c.2 1.55 1 2.45 2.5 2.62-1.5.18-2.3 1.08-2.5 2.63-.2-1.55-1-2.45-2.5-2.63 1.5-.17 2.3-1.07 2.5-2.62Z"
        fill="currentColor"
        opacity="0.65"
      />
    </svg>
  );
}
