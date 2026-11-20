import { beforeEach, describe, expect, it } from "vitest";
import { useStore, HISTORY_MAX } from "../src/store";
import type { LngLat } from "../src/engine/geo";

const sq = (d: number): LngLat[] => [[100 + d, 13], [100.001 + d, 13], [100.001 + d, 13.001], [100 + d, 13.001], [100 + d, 13]];
const st = () => useStore.getState();
const initial = useStore.getState();

describe("undo / redo snapshot stack", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("undo restores the previous plot and road edges; redo re-applies", () => {
    st().setPlot(sq(0));
    st().commit();
    st().setRoadEdges({ 0: { widthM: 12, confirmed: true } }, "user");
    st().commit();
    st().setPlot(sq(0.01));
    st().commit();
    expect(st().history.entries.length).toBe(4);

    expect(st().undo()).toBe(true);
    expect(st().plot).toEqual(sq(0));
    expect(st().roadEdges[0].widthM).toBe(12);
    expect(st().undo()).toBe(true);
    expect(st().roadEdges).toEqual({});
    expect(st().undo()).toBe(true);
    expect(st().plot).toBeNull();
    expect(st().undo()).toBe(false); // nothing left

    expect(st().redo()).toBe(true);
    expect(st().plot).toEqual(sq(0));
    expect(st().redo()).toBe(true);
    expect(st().redo()).toBe(true);
    expect(st().plot).toEqual(sq(0.01));
    expect(st().redo()).toBe(false);
  });

  it("a new commit after undo drops the redo branch", () => {
    st().setPlot(sq(0));
    st().commit();
    st().setPlot(sq(1));
    st().commit();
    st().undo();
    st().setPlot(sq(2));
    st().commit();
    expect(st().redo()).toBe(false);
    st().undo();
    expect(st().plot).toEqual(sq(0));
  });

  it("identical commits are ignored; amendCurrent rewrites the current entry", () => {
    st().setPlot(sq(0));
    st().commit();
    st().commit();
    expect(st().history.entries.length).toBe(2);
    st().setRoadEdges({ 0: { widthM: 8, confirmed: false } }, "auto");
    st().amendCurrent();
    expect(st().history.entries.length).toBe(2);
    st().undo();
    st().redo();
    expect(st().roadEdges[0].widthM).toBe(8);
  });

  it("keeps at most HISTORY_MAX entries", () => {
    for (let i = 0; i < HISTORY_MAX + 20; i++) {
      st().setPlot(sq(i));
      st().commit();
    }
    expect(st().history.entries.length).toBe(HISTORY_MAX);
    let n = 0;
    while (st().undo()) n++;
    expect(n).toBe(HISTORY_MAX - 1);
    expect(st().plot).toEqual(sq(20)); // oldest kept entry
  });

  it("each restore bumps restoreSeq", () => {
    st().setPlot(sq(0));
    st().commit();
    const s0 = st().restoreSeq;
    st().undo();
    st().redo();
    expect(st().restoreSeq).toBe(s0 + 2);
  });
});
