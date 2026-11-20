import Link from "next/link";
import { Geist, Instrument_Serif } from "next/font/google";
import { TARGET_ZONE } from "@/rules";
import { LandingList } from "./LandingList";

// Landing-page type only (the tool keeps Inter): a sans body and an italic serif display face.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

const pill = "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-[transform,background-color] active:scale-95";

export default function Landing() {
  return (
    <div className={`${sans.variable} ${serif.variable} min-h-dvh bg-[#f4f2ee] text-[#151515]`} style={{ fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif" }}>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark />
          <span className="text-[27px] italic leading-none tracking-tight" style={{ fontFamily: "var(--font-serif), serif" }}>
            Plotwise
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <span className={`${pill} bg-[#f5c542] text-[#151515] max-sm:hidden`}>Zone {TARGET_ZONE.zoneCode}</span>
          <Link href="/tool?demo=1" className={`${pill} bg-[#ebe8e2] text-[#151515] hover:bg-[#e2ded6] max-sm:hidden`}>
            Demo plot
          </Link>
          <Link href="/tool" className={`${pill} bg-[#151515] text-white shadow-sm hover:bg-black`}>
            Open the tool
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="overflow-hidden rounded-[22px] bg-[#faf9f7] shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06]">
          <section className="relative isolate flex min-h-[300px] flex-col items-center justify-center overflow-hidden bg-[#0d0d0d] px-5 py-14 text-center sm:min-h-[420px]">
            <HeroArt />
            <h1
              className="reveal text-[44px] italic leading-[1.05] text-[#f5d87a] drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-[64px]"
              style={{ fontFamily: "var(--font-serif), serif" }}
            >
              What can you build here?
            </h1>
            <p className="reveal mt-4 max-w-xl text-[15px] font-medium leading-snug text-white/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)] sm:text-[17px]" style={{ animationDelay: "80ms" }}>
              Draw a Bangkok plot in zone {TARGET_ZONE.zoneCode}. See, live, the floor area and height the law allows, the 3D space it
              must fit in, and three designs checked rule by rule.
            </p>
            <div className="reveal mt-7 flex flex-wrap justify-center gap-3" style={{ animationDelay: "160ms" }}>
              <Link href="/tool?demo=1" className={`${pill} bg-[#f5c542] px-5 py-2.5 text-[14px] text-[#151515] hover:bg-[#f0b92a]`}>
                Try the demo plot →
              </Link>
              <Link href="/tool" className={`${pill} bg-white/10 px-5 py-2.5 text-[14px] text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/20`}>
                Draw my own plot
              </Link>
            </div>
            <Link
              href="/tool?tour=1"
              className="reveal mt-4 text-[13px] font-medium text-white/80 underline decoration-white/40 underline-offset-4 hover:text-white"
              style={{ animationDelay: "220ms" }}
            >
              New here? Take the guided tour
            </Link>
          </section>

          <LandingList />

          <div className="px-4 pb-8 sm:px-12">
            <Link href="/tool" className="block rounded-2xl bg-[#efede8] py-3.5 text-center text-[15px] font-medium text-[#252525] transition-colors hover:bg-[#e6e3dc]">
              Open the tool →
            </Link>
          </div>
        </div>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-8 text-[13px] text-[#6b6b6b] sm:px-6">
        <span className="flex items-center gap-2">
          <LogoMark small />
          <span className="italic text-[#151515]" style={{ fontFamily: "var(--font-serif), serif", fontSize: 18 }}>
            Plotwise
          </span>
          · Bangkok zone {TARGET_ZONE.zoneCode}
        </span>
        <span>A feasibility study, not a design. An architect must check and sign.</span>
      </footer>
    </div>
  );
}

/** A plot outline with a rising block: the brand mark. */
function LogoMark({ small }: { small?: boolean }) {
  const s = small ? 18 : 26;
  return (
    <svg width={s} height={s} viewBox="0 0 26 26" aria-hidden>
      <path d="M3 17 L13 22 L23 17 L13 12 Z" fill="#e4a11b" opacity="0.35" />
      <path d="M8 15.5 V7 L13 9.5 V18 Z" fill="#e4a11b" />
      <path d="M13 9.5 L18 7 V15.5 L13 18 Z" fill="#c9850c" />
      <path d="M8 7 L13 4.5 L18 7 L13 9.5 Z" fill="#f5c542" />
    </svg>
  );
}

/* ---------- hero: a night city in halftone grey, the allowed space glowing in the middle ---------- */

/** Isometric box: footprint w×d at ground (x, y), height h. */
function Box({ x, y, w, d, h, tone, opacity = 1 }: { x: number; y: number; w: number; d: number; h: number; tone: number; opacity?: number }) {
  const dx = d * 0.8;
  const dy = d * 0.45;
  const g = (k: number) => `rgb(${k},${k},${k})`;
  return (
    <g opacity={opacity}>
      <polygon points={`${x},${y} ${x + w},${y} ${x + w},${y - h} ${x},${y - h}`} fill={g(tone)} />
      <polygon points={`${x + w},${y} ${x + w + dx},${y - dy} ${x + w + dx},${y - h - dy} ${x + w},${y - h}`} fill={g(tone - 28)} />
      <polygon points={`${x},${y - h} ${x + w},${y - h} ${x + w + dx},${y - h - dy} ${x + dx},${y - h - dy}`} fill={g(tone + 30)} />
    </g>
  );
}

const CITY: [number, number, number, number, number, number][] = [
  // x, y, w, d, h, tone
  [20, 300, 70, 50, 150, 120], [110, 330, 60, 40, 90, 140], [190, 290, 80, 50, 210, 105], [60, 420, 90, 60, 120, 150],
  [180, 440, 70, 50, 70, 165], [300, 470, 80, 40, 60, 150], [700, 470, 90, 50, 80, 150], [800, 300, 70, 50, 190, 110],
  [880, 330, 60, 40, 110, 135], [960, 290, 90, 60, 230, 100], [850, 440, 90, 60, 130, 155], [980, 450, 80, 50, 80, 165],
  [1060, 330, 60, 50, 140, 125], [290, 330, 60, 40, 130, 125], [730, 340, 50, 40, 150, 120],
];

function HeroArt() {
  return (
    <svg className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 1100 480" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" fill="#000" opacity="0.55" />
        </pattern>
        <radialGradient id="glow" cx="50%" cy="58%" r="45%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vignette" cx="50%" cy="40%" r="60%">
          <stop offset="40%" stopColor="#0d0d0d" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0d0d0d" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* streets */}
      <g stroke="#2a2a2a" strokeWidth="18" fill="none">
        <path d="M-20 400 L1120 330" />
        <path d="M420 -20 L560 500" />
      </g>
      {CITY.map(([x, y, w, d, h, t], i) => (
        <Box key={i} x={x} y={y} w={w} d={d} h={h} tone={t} />
      ))}
      {/* the plot and its allowed space, stepping back like the sky plane */}
      <rect x="0" y="0" width="1100" height="480" fill="url(#glow)" />
      <polygon points="470,440 610,440 690,395 550,395" fill="none" stroke="#e4572e" strokeWidth="3" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} opacity="0.75">
          <polygon
            points={`${480 + i * 8},${436 - i * 52} ${600 - i * 4},${436 - i * 52} ${600 - i * 4},${384 - i * 52} ${480 + i * 8},${384 - i * 52}`}
            fill="#22d3ee"
            fillOpacity="0.55"
          />
          <polygon
            points={`${600 - i * 4},${436 - i * 52} ${672 - i * 10},${396 - i * 50} ${672 - i * 10},${344 - i * 50} ${600 - i * 4},${384 - i * 52}`}
            fill="#0891b2"
            fillOpacity="0.55"
          />
        </g>
      ))}
      <rect x="0" y="0" width="1100" height="480" fill="url(#dots)" />
      <rect x="0" y="0" width="1100" height="480" fill="url(#vignette)" />
    </svg>
  );
}
