import * as d3 from "d3";
import type { FormResult } from "../../domain/types";
import { C, useD3 } from "./useD3";

/** Cumulative points trajectory over the last five results (W=+1, D=0, L=-1). */
export function FormSparkline({ form, width = 56, height = 18 }: { form: FormResult[]; width?: number; height?: number }) {
  const ref = useD3(
    (svg) => {
      const vals = form.reduce<number[]>((acc, r) => [...acc, (acc.at(-1) ?? 0) + (r === "W" ? 1 : r === "L" ? -1 : 0)], [0]);
      const x = d3.scaleLinear().domain([0, vals.length - 1]).range([2, width - 2]);
      const y = d3.scaleLinear().domain([-5, 5]).range([height - 2, 2]);
      svg.append("line").attr("x1", 0).attr("x2", width).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", C.line);
      const last = vals.at(-1) ?? 0;
      svg
        .append("path")
        .datum(vals)
        .attr("fill", "none")
        .attr("stroke", last > 0 ? C.good : last < 0 ? C.bad : C.ink3)
        .attr("stroke-width", 1.5)
        .attr("d", d3.line<number>().x((_, i) => x(i)).y((d) => y(d)).curve(d3.curveMonotoneX));
      svg.append("circle").attr("cx", x(vals.length - 1)).attr("cy", y(last)).attr("r", 2).attr("fill", last > 0 ? C.good : last < 0 ? C.bad : C.ink3);
    },
    [form.join(""), width, height],
  );
  return <svg ref={ref} width={width} height={height} role="img" aria-label={`Form trajectory ${form.join("")}`} />;
}
