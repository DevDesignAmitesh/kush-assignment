import { ButtonLink } from "@/ui/Button";
import { TARGET_ZONE } from "@/rules";

// `live` marks steps that work in the current build; flip as milestones land.
const STEPS = [
  {
    n: 1,
    title: "Mark your plot on the map",
    text: "Click the corners of the land on a real Bangkok map. Any shape works. Drag corners to fine-tune; the area updates as you go.",
    live: true,
    art: <DrawArt />,
  },
  {
    n: 2,
    title: "Pick the road and building type",
    text: "Tell us which side faces the road and how wide it is, then choose condo, office or hotel. These decide which rules apply.",
    live: false,
    art: <RoadArt />,
  },
  {
    n: 3,
    title: "See the rules and the allowed 3D space",
    text: "Every limit that applies (floor area, open space, setbacks, height) with the legal clause, plus the 3D volume you're allowed to build in.",
    live: false,
    art: <EnvelopeArt />,
  },
  {
    n: 4,
    title: "Compare concept designs",
    text: "Several building options that fit the plot, shown in 3D among the real neighbours, each with a pass/fail checklist.",
    live: false,
    art: <DesignsArt />,
  },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold tracking-tight">Plotwise</span>
          <span className="text-sm text-neutral-500">Bangkok · zone {TARGET_ZONE.zoneCode}</span>
        </div>
        <ButtonLink href="/tool" variant="ghost">
          Skip to the tool →
        </ButtonLink>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 sm:pt-14">
        <p className="reveal text-sm font-medium text-[#e4572e]">Plot feasibility, before you pay an architect</p>
        <h1 className="reveal mt-2 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl" style={{ animationDelay: "80ms" }}>
          What can you build on your Bangkok plot?
        </h1>
        <p className="reveal mt-4 max-w-2xl text-base text-neutral-600 sm:text-lg" style={{ animationDelay: "160ms" }}>
          Draw the land, and Plotwise works out how big and how tall a building the law allows, and what it could look
          like. Here is how it works, in four steps.
        </p>
        <div className="reveal mt-7 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
          <ButtonLink href="/tool?demo=1" variant="primary" className="px-5 py-2.5 text-base">
            Try it with a demo plot →
          </ButtonLink>
          <ButtonLink href="/tool" className="px-5 py-2.5 text-base">
            Draw my own plot
          </ButtonLink>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className="reveal flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
              style={{ animationDelay: `${320 + i * 90}ms` }}
            >
              <div className="aspect-[10/7] bg-neutral-100">{s.art}</div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-400">STEP {s.n}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      s.live ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {s.live ? "Live now" : "Coming next"}
                  </span>
                </div>
                <h2 className="mt-1.5 font-semibold leading-snug">{s.title}</h2>
                <p className="mt-1.5 text-sm text-neutral-600">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-2xl bg-neutral-900 px-6 py-6 text-white sm:flex sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">Ready? Start with step 1.</div>
            <div className="mt-1 text-sm text-neutral-300">
              On the map: press <b>Draw plot</b>, click each corner, then click the first corner again to finish.
            </div>
          </div>
          <div className="mt-4 flex gap-3 sm:mt-0">
            <ButtonLink href="/tool?demo=1" className="border-transparent">
              Demo plot
            </ButtonLink>
            <ButtonLink href="/tool" variant="primary" className="bg-[#e4572e] hover:bg-[#cf4a23]">
              Open the tool →
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- step illustrations (inline SVG, looping CSS animations) ---------- */

const ACC = "#e4572e";

function Streets() {
  return (
    <g stroke="#e5e5e5" strokeWidth="6" fill="none">
      <path d="M-10 118 L210 88" />
      <path d="M40 -10 L70 150" />
      <path d="M150 -10 L170 150" strokeWidth="4" />
    </g>
  );
}

function DrawArt() {
  const pts = [
    [62, 30],
    [138, 24],
    [150, 82],
    [80, 96],
  ];
  return (
    <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
      <Streets />
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={ACC} fillOpacity="0.15" className="fill-late" />
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={ACC} strokeWidth="2.5" strokeLinejoin="round" className="draw-path" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4.5" fill="#fff" stroke={ACC} strokeWidth="2" className="pop" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}
    </svg>
  );
}

function RoadArt() {
  return (
    <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
      <rect x="0" y="100" width="200" height="22" fill="#d4d4d4" />
      <path d="M0 111 H200" stroke="#fff" strokeWidth="1.5" strokeDasharray="8 6" />
      <polygon points="50,30 150,30 150,96 50,96" fill={ACC} fillOpacity="0.12" stroke={ACC} strokeWidth="2" />
      <path d="M50 96 H150" stroke={ACC} strokeWidth="5" strokeLinecap="round" className="blink-edge" />
      <g fontSize="9" fontFamily="sans-serif" fontWeight="600">
        {["Condo", "Office", "Hotel"].map((t, i) => (
          <g key={t} className="cycle" style={{ animationDelay: `${i * 1.5}s` }}>
            <rect x={38 + i * 43} y="8" width="38" height="15" rx="7.5" fill="#171717" />
            <text x={57 + i * 43} y="18.5" textAnchor="middle" fill="#fff">
              {t}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Isometric box helper: footprint w×d at ground y, height h, offset back by `back`. */
function IsoBox({ x, y, w, d, h, fill, cls, delay }: { x: number; y: number; w: number; d: number; h: number; fill: string; cls?: string; delay?: string }) {
  const dx = d * 0.7;
  const dy = d * 0.4;
  const top = `${x},${y - h} ${x + w},${y - h} ${x + w + dx},${y - h - dy} ${x + dx},${y - h - dy}`;
  const front = `${x},${y} ${x + w},${y} ${x + w},${y - h} ${x},${y - h}`;
  const side = `${x + w},${y} ${x + w + dx},${y - dy} ${x + w + dx},${y - h - dy} ${x + w},${y - h}`;
  return (
    <g className={cls} style={delay ? { animationDelay: delay } : undefined}>
      <polygon points={front} fill={fill} fillOpacity="0.85" />
      <polygon points={side} fill={fill} fillOpacity="0.6" />
      <polygon points={top} fill={fill} fillOpacity="1" />
    </g>
  );
}

function EnvelopeArt() {
  // Terraces stepping back from the road (front), like the height-vs-road rule.
  const tiers = [
    { y: 120, h: 22, back: 0 },
    { y: 98, h: 20, back: 6 },
    { y: 78, h: 20, back: 12 },
    { y: 58, h: 18, back: 18 },
  ];
  return (
    <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
      <rect x="0" y="122" width="200" height="18" fill="#d4d4d4" />
      {tiers.map((t, i) => (
        <IsoBox key={i} x={45 + t.back * 0.7} y={t.y - t.back * 0.4} w={90} d={40 - t.back} h={t.h} fill="#22d3ee" cls="rise" delay={`${i * 0.35}s`} />
      ))}
    </svg>
  );
}

function DesignsArt() {
  return (
    <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
      <IsoBox x={18} y={120} w={44} d={26} h={44} fill="#a3a3a3" cls="rise" />
      <IsoBox x={92} y={120} w={44} d={26} h={22} fill="#a3a3a3" cls="rise" delay="0.3s" />
      <IsoBox x={100} y={98} w={22} d={18} h={60} fill="#737373" cls="rise" delay="0.6s" />
      <g className="tick-in" style={{ animationDelay: "1s" }}>
        <rect x="150" y="30" width="44" height="54" rx="5" fill="#fff" stroke="#e5e5e5" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <path d={`M156 ${42 + i * 11} l3 3 l5 -6`} stroke="#059669" strokeWidth="2" fill="none" />
            <rect x="168" y={39 + i * 11} width="20" height="4" rx="2" fill="#e5e5e5" />
          </g>
        ))}
      </g>
    </svg>
  );
}
