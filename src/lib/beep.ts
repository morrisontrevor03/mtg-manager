"use client";

/**
 * Short Web Audio tones for voice-entry feedback.
 *
 * Deliberately not speech synthesis: spoken confirmations feed straight back
 * into the open microphone and get transcribed as the next card.
 */

type Tone = "added" | "confirm" | "failed";

const TONES: Record<Tone, { freq: number; duration: number }[]> = {
  added: [{ freq: 880, duration: 0.09 }],
  confirm: [
    { freq: 620, duration: 0.08 },
    { freq: 780, duration: 0.08 },
  ],
  failed: [{ freq: 220, duration: 0.16 }],
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function beep(tone: Tone): void {
  const audio = context();
  if (!audio) return;
  // Autoplay policy can leave the context suspended until a user gesture.
  if (audio.state === "suspended") void audio.resume().catch(() => undefined);

  let at = audio.currentTime;
  for (const { freq, duration } of TONES[tone]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Ramp instead of a hard stop, which would click.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
    at += duration;
  }
}
