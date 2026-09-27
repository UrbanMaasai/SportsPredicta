import * as d3 from "d3";
import { C, useD3 } from "./useD3";

export interface Series {
  name: string;
  color: string;
  values: { x: number; y: number }[];
}

/** Multi-series line chart with a labelled y-axis and optional x tick formatter. */
export function TrendLine({
  series,
  width = 560,
  height = 180,
  yDomain,
  xFormat,
  yFormat = (v) => String(v),
  label,
}: {
  series: Series[];
  width?: number;
  height?: number;
  yDomain?: [number, number];
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  label: string;
}) {
  const ref = useD3(
    (svg) => {
      const m = { t: 10, r: 12, b: 22, l: 40 };
      const all = series.flatMap((s) => s.values);
      if (all.length === 0) return;
      const x = d3.scaleLinear().domain(d3.extent(all, (d) => d.x) as [number, number]).range([m.l, width - m.r]);
      const ext = yDomain ?? (d3.extent(all, (d) => d.y) as [number, number]);
      const pad = yDomain ? 0 : (ext[1] - ext[0]) * 0.1 || 0.1;
      const y = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).nice().range([height - m.b, m.t]);
      const yAxis = svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => yFormat(Number(v))).tickSize(-(width - m.l - m.r)));
      yAxis.select(".domain").remove();
      yAxis.selectAll("line").attr("stroke", C.line);
      yAxis.selectAll("text").attr("fill", C.ink3).attr("font-family", "JetBrains Mono").attr("font-size", 10);
      const xAxis = svg
        .append("g")
        .attr("transform", `translate(0,${height - m.b})`)
        .call(d3.axisBottom(x).ticks(Math.min(8, all.length)).tickFormat((v) => (xFormat ? xFormat(Number(v)) : String(v))).tickSize(0).tickPadding(8));
      xAxis.select(".domain").attr("stroke", C.line);
      xAxis.selectAll("text").attr("fill", C.ink3).attr("font-family", "JetBrains Mono").attr("font-size", 10);
      for (const s of series) {
        svg
          .append("path")
          .datum(s.values)
          .attr("fill", "none")
          .attr("stroke", s.color)
          .attr("stroke-width", 2)
          .attr("d", d3.line<{ x: number; y: number }>().x((d) => x(d.x)).y((d) => y(d.y)).curve(d3.curveMonotoneX));
        svg
          .append("g")
          .selectAll("circle")
          .data(s.values)
          .join("circle")
          .attr("cx", (d) => x(d.x))
          .attr("cy", (d) => y(d.y))
          .attr("r", 2.5)
          .attr("fill", s.color)
          .append("title")
          .text((d) => `${s.name}: ${yFormat(d.y)}`);
      }
    },
    [JSON.stringify(series), width, height, yDomain?.join(",")],
  );
  return <svg ref={ref} viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={label} />;
}
