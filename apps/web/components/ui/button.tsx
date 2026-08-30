"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
};

/** The prototype's `.btn` family. */
export function Button({ variant = "secondary", className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`btn ${VARIANT_CLASS[variant]} ${className}`.trim()} {...rest} />;
}
