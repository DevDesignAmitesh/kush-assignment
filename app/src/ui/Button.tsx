"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { sound } from "./sound";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "btn relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-lg px-3.5 py-2 text-sm font-medium " +
  "transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out " +
  "hover:-translate-y-px active:translate-y-0 active:scale-[0.96] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e4572e] focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-neutral-900 text-white shadow-sm hover:bg-neutral-800 hover:shadow-md",
  secondary: "border border-neutral-300 bg-white text-neutral-900 shadow-sm hover:border-neutral-400 hover:shadow-md",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
};

/** Spawns a ripple at the pointer position inside the button. */
function ripple(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const span = document.createElement("span");
  span.className = "btn-ripple";
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${e.clientX - r.left - size / 2}px`;
  span.style.top = `${e.clientY - r.top - size / 2}px`;
  el.appendChild(span);
  span.addEventListener("animationend", () => span.remove());
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Adds a soft pulsing halo to draw the eye (e.g. the next action to take). */
  pulse?: boolean;
  children: ReactNode;
}

export function Button({ variant = "secondary", pulse, className = "", onClick, onPointerDown, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`${base} ${variants[variant]} ${pulse ? "btn-pulse" : ""} ${className}`}
      onPointerDown={(e) => {
        ripple(e);
        onPointerDown?.(e);
      }}
      onClick={(e) => {
        sound.click();
        onClick?.(e);
      }}
    />
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${className}`}
      onPointerDown={ripple}
      onClick={() => sound.click()}
    >
      {children}
    </Link>
  );
}
