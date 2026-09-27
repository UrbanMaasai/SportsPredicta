import * as d3 from "d3";
import { C, useD3 } from "./useD3";

/** Diverging bars of recent head-to-head goal margins (home perspective). */
export function H2HChart({ margins, home, away, width = 320, height = 120 }: { margins: number[]; home: string; away: string; width?: number; height?: number }) {
  const ref = useD3(
    (svg) => {
      const m = { t: 8, r: 8, b: 18, l: 8 };
      const x = d3.scaleBand<number>().domain(margins.map((_, i) => i)).range([m.l, width - m.r]).padding(0.3);
      const max = Math.max(3, ...margins.map(Math.abs));
      const y = d3.scaleLinear().domain([-max, max]).range([height - m.b, m.t]);
      svg.append("line").attr("x1", m.l).attr("x2", width - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", C.line);
      svg
        .selectAll("rect")
        .data(margins)
        .join("rect")
        .attr("x", (_, i) => x(i)!)
        .attr("width", x.bandwidth())
        .attr("y", (d) => (d >= 0 ? y(d) : y(0)))
        .attr("height", (d) => (d === 0 ? 2 : Math.abs(y(d) - y(0))))
        .attr("rx", 2)
        .attr("fill", (d) => (d > 0 ? C.home : d < 0 ? C.away : C.draw));
      svg
        .selectAll("text.v")
        .data(margins)
        .join("text")
        .attr("class", "v")
        .attr("x", (_, i) => x(i)! + x.bandwidth() / 2)
        .attr("y", (d) => (d >= 0 ? y(d) - 3 : y(d) + 10))
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("font-family", "JetBrains Mono")
        .attr("fill", C.ink2)
        .text((d) => (d > 0 ? `+${d}` : `${d}`));
      svg.append("text").attr("x", m.l).attr("y", height - 4).attr("font-size", 10).attr("fill", C.home).text(`▲ ${home}`);
      svg.append("text").attr("x", width - m.r).attr("y", height - 4).attr("text-anchor", "end").attr("font-size", 10).attr("fill", C.away).text(`${away} ▼`);
    },
    [margins.join(","), home, away, width, height],
  );
  return <svg ref={ref} width={width} height={height} role="img" aria-label="Head-to-head goal margins" />;
}
