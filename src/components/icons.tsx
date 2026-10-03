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

/**
 * Google's "G" mark, in its own colours. Google's sign-in branding guidelines
 * require the official mark on a "Continue with Google" button, so this one
 * does not inherit `currentColor` like the others.
 */
export function GoogleIcon({ className = "", size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
