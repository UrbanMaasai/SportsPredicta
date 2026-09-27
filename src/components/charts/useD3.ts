import { useEffect, useRef } from "react";
import * as d3 from "d3";

/** Render into an <svg> with D3 whenever deps change; clears previous content first. */
export function useD3(render: (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void, deps: unknown[]) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    render(svg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export const C = {
  ink: "#0f172a",
  ink2: "#475569",
  ink3: "#7b8697",
  line: "#e2e5ea",
  accent: "#0f766e",
  accentSoft: "#9fd6cf",
  warn: "#b45309",
  bad: "#b91c1c",
  good: "#15803d",
  home: "#0f766e",
  draw: "#7b8697",
  away: "#6d4bd1",
};
