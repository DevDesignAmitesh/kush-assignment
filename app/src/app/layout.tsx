import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TARGET_ZONE } from "@/rules";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Plotwise Bangkok",
  description: `Plot feasibility and 3D massing for Bangkok zone ${TARGET_ZONE.zoneCode}`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
