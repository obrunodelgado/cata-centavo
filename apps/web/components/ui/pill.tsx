"use client";

import type { ReactNode } from "react";

export type PillTone = "accent" | "pos" | "neg" | "flat";

const TONE_CLASS: Readonly<Record<PillTone, string>> = {
  accent: "",
  pos: "pos",
  neg: "neg",
  flat: "flat",
};

export function Pill({ tone = "accent", children }: { readonly tone?: PillTone; readonly children: ReactNode }) {
  return <span className={`pill ${TONE_CLASS[tone]}`}>{children}</span>;
}

/** A small neutral tag, the prototype's `.tag`. */
export function Tag({ children }: { readonly children: ReactNode }) {
  return <span className="tag">{children}</span>;
}
