import { useStore } from "@/store";

// Width edits (slider drags, typing, +/−) become one undo entry after 500 ms of quiet.
let commitTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleCommit() {
  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = setTimeout(() => useStore.getState().commit(), 500);
}
