"use client";

import { useStore } from "@/store";
import { clampRoadWidth, ROAD_WIDTH_LIMITS } from "@/engine/assumptions";
import { sound } from "./sound";
import { scheduleCommit } from "./commitLater";
import { edgeList, groupRoadEdges, patchGroup, removeGroup, type RoadGroup } from "./roadGroups";


/** Road edges grouped by road: one card per road, one shared width (Expert). */
export function RoadEdges() {
  const plot = useStore((s) => s.plot);
  const roadEdges = useStore((s) => s.roadEdges);
  const setRoadEdges = useStore((s) => s.setRoadEdges);
  const compute = useStore((s) => s.compute);
  // Derive in render: a selector returning a fresh array would loop forever (AI miss #19).
  const clamped = new Set(compute?.roadEdges.filter((r) => r.clamped).map((r) => r.edge) ?? []);
  if (!plot) return null;
  const groups = groupRoadEdges(roadEdges);

  const update = (g: RoadGroup, widthM: number) => {
    setRoadEdges(patchGroup(roadEdges, g, { widthM, confirmed: true }), "user");
    scheduleCommit();
  };

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-neutral-700">Roads</span>
        <span className="text-[11px] text-neutral-400">tap a plot edge to add or remove</span>
      </div>
      {groups.length === 0 ? (
        <div className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600 ring-1 ring-neutral-200">Tap the plot edge that faces the road.</div>
      ) : (
        <ul className="mt-2 space-y-2">
          {groups.map((g) => (
            <li key={g.key} className={`rounded-lg px-2.5 py-2 ring-1 ${g.confirmed ? "bg-blue-50 ring-blue-200" : "bg-white ring-neutral-300 [border-style:dashed]"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-[12px] font-medium">
                  {g.name ?? "Road (added by you)"}
                  <span className="font-normal text-neutral-500">
                    {" "}
                    · edge{g.edges.length > 1 ? "s" : ""} {edgeList(g.edges)}
                    {g.roadClass ? ` · ${g.roadClass}` : ""}
                  </span>
                </div>
                <button
                  className="text-xs text-neutral-400 hover:text-neutral-900"
                  onClick={() => {
                    sound.click();
                    setRoadEdges(removeGroup(roadEdges, g), "user");
                    useStore.getState().commit();
                  }}
                  aria-label={`Remove road ${g.name ?? edgeList(g.edges)}`}
                >
                  ✕
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="range"
                  min={ROAD_WIDTH_LIMITS.minM}
                  max={ROAD_WIDTH_LIMITS.maxM}
                  step={0.5}
                  value={g.widthM}
                  onChange={(e) => update(g, clampRoadWidth(Number(e.target.value)).value)}
                  className="min-w-0 flex-1 accent-blue-600"
                  aria-label={`Road width for ${g.name ?? `edge ${edgeList(g.edges)}`}`}
                />
                <input
                  type="number"
                  step={0.5}
                  value={g.widthM}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (e.target.value === "" || Number.isNaN(raw)) return;
                    update(g, clampRoadWidth(raw).value);
                    if (clampRoadWidth(raw).clamped) useStore.getState().showToast(`Road width kept within ${ROAD_WIDTH_LIMITS.minM}-${ROAD_WIDTH_LIMITS.maxM} m`);
                  }}
                  className="w-16 rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 text-right text-sm tabular-nums"
                  aria-label={`Road width in metres for ${g.name ?? `edge ${edgeList(g.edges)}`}`}
                />
                <span className="text-xs text-neutral-500">m</span>
              </div>
              {!g.confirmed ? (
                <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-600">
                  <span>
                    <span className="mr-1 rounded bg-neutral-100 px-1 py-px text-[10px] font-semibold">estimate</span>please confirm
                  </span>
                  <button className="rounded bg-neutral-900 px-1.5 py-0.5 font-semibold text-white hover:bg-neutral-700" onClick={() => update(g, g.widthM)}>
                    Looks right
                  </button>
                </div>
              ) : (
                g.edges.some((e) => clamped.has(e)) && <div className="mt-1 text-[11px] text-neutral-500">Kept within {ROAD_WIDTH_LIMITS.minM}-{ROAD_WIDTH_LIMITS.maxM} m.</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
