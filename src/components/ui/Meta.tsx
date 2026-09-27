import { Children, type ReactNode } from "react";

/** Quiet inline metadata joined by typographic separators — no pills, no boxes. */
export function Meta({ children, className = "" }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <p className={`meta flex flex-wrap items-center ${className}`}>
      {items.map((c, i) => (
        <span key={i} className={i > 0 ? "sep" : undefined}>
          {c}
        </span>
      ))}
    </p>
  );
}
