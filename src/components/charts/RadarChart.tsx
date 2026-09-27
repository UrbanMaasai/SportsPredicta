import { C, useD3 } from "./useD3";

export interface RadarAxis {
  label: string;
  home: number; // 0..1
  away: number; // 0..1
}

/** Tactical radar comparing two sides on normalised axes. */
export function RadarChart({ axes, size = 240 }: { axes: RadarAxis[]; size?: number }) {
  const ref = useD3(
    (svg) => {
      const r = size / 2 - 34;
      const g = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);
      const angle = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;
      for (const lvl of [0.25, 0.5, 0.75, 1]) {
        g.append("polygon")
          .attr("points", axes.map((_, i) => [Math.cos(angle(i)) * r * lvl, Math.sin(angle(i)) * r * lvl].join(",")).join(" "))
          .attr("fill", "none")
          .attr("stroke", C.line);
      }
      axes.forEach((a, i) => {
        g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", Math.cos(angle(i)) * r).attr("y2", Math.sin(angle(i)) * r).attr("stroke", C.line);
        g.append("text")
          .attr("x", Math.cos(angle(i)) * (r + 16))
          .attr("y", Math.sin(angle(i)) * (r + 16))
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("font-size", 10)
          .attr("fill", C.ink2)
          .text(a.label);
      });
      const poly = (key: "home" | "away", color: string) =>
        g
          .append("polygon")
          .attr("points", axes.map((a, i) => [Math.cos(angle(i)) * r * a[key], Math.sin(angle(i)) * r * a[key]].join(",")).join(" "))
          .attr("fill", color)
          .attr("fill-opacity", 0.14)
          .attr("stroke", color)
          .attr("stroke-width", 1.5);
      poly("home", C.home);
      poly("away", C.away);
    },
    [JSON.stringify(axes), size],
  );
  return <svg ref={ref} width={size} height={size} role="img" aria-label="Tactical radar" />;
}
