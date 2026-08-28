import type { HTMLAttributes, ReactNode } from "react";

interface SpCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function SpCard({ children, className, ...props }: SpCardProps) {
  return <article className={["sp-card", className].filter(Boolean).join(" ")} {...props}>{children}</article>;
}
