"use client";

import { useEffect } from "react";
import { useStore } from "@/store";

const styles = {
  info: "bg-neutral-900 text-white",
  success: "bg-emerald-600 text-white",
  error: "bg-red-600 text-white",
} as const;

export function Toast() {
  const toast = useStore((s) => s.toast);
  const hide = useStore((s) => s.hideToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => hide(toast.id), 2600);
    return () => clearTimeout(t);
  }, [toast, hide]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
      <div key={toast.id} className={`toast-in rounded-full px-4 py-2 text-sm font-medium shadow-lg ${styles[toast.kind]}`}>
        {toast.kind === "success" && "✓ "}
        {toast.text}
      </div>
    </div>
  );
}
