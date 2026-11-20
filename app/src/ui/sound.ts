// Tiny UI sounds synthesised with Web Audio: no audio files, no network.
import { useStore } from "@/store";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || useStore.getState().muted) return null;
  try {
    if (!ctx) {
      const C =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
}

function tone(freq: number, dur: number, { type = "sine", gain = 0.07, delay = 0, slideTo }: ToneOpts = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sound = {
  /** Button press. */
  click: () => tone(620, 0.07, { type: "triangle", slideTo: 420 }),
  /** A corner placed on the map. */
  tick: () => tone(1100, 0.045, { type: "sine", gain: 0.05 }),
  /** Something finished well (plot drawn / loaded). */
  success: () => {
    tone(660, 0.12, { type: "sine" });
    tone(990, 0.18, { type: "sine", delay: 0.09 });
  },
  /** Rejected action. */
  error: () => tone(200, 0.22, { type: "square", gain: 0.035, slideTo: 140 }),
};
