import type { Metadata } from "next";
import ClientShell from "../ClientShell";

export const metadata: Metadata = { title: "Plotwise Bangkok · Tool" };

export default function ToolPage() {
  return <ClientShell />;
}
