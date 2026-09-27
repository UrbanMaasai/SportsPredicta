import type { Coupon, Selections } from "./types";
import type { JackpotRules } from "./jackpot";
import { combinations } from "./jackpot";
import { formatSms } from "./export";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** High-contrast betting ticket as a standalone SVG (for PNG/SVG export). */
export function ticketSvg(coupon: Coupon, selections: Selections, rules: JackpotRules, name: string): string {
  const W = 420;
  const rowH = 24;
  const top = 96;
  const H = top + coupon.fixtures.length * rowH + 92;
  const lines = combinations(selections, coupon.fixtures);
  const sms = formatSms(selections, coupon.fixtures, rules);
  const rows = coupon.fixtures
    .map((f, i) => {
      const y = top + i * rowH;
      const picks = (selections[f.id] ?? []).join("/");
      const teams = `${f.home} v ${f.away}`;
      return `
      <text x="20" y="${y}" class="m" fill="#64748b">${String(f.leg).padStart(2, "0")}</text>
      <text x="48" y="${y}" class="s">${esc(teams.length > 38 ? teams.slice(0, 37) + "…" : teams)}</text>
      <text x="${W - 20}" y="${y}" class="m b" text-anchor="end">${esc(picks || "—")}</text>
      <line x1="20" x2="${W - 20}" y1="${y + 8}" y2="${y + 8}" stroke="#e2e8f0"/>`;
    })
    .join("");
  const foot = top + coupon.fixtures.length * rowH + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    .s{font:500 13px 'Plus Jakarta Sans',Arial,sans-serif;fill:#0f172a}
    .m{font:500 13px 'JetBrains Mono',Menlo,monospace;fill:#0f172a;font-variant-numeric:tabular-nums}
    .b{font-weight:700}
    .h{font:700 18px 'Plus Jakarta Sans',Arial,sans-serif;fill:#fff}
    .k{font:500 11px 'Plus Jakarta Sans',Arial,sans-serif;fill:#94a3b8}
  </style>
  <rect width="${W}" height="${H}" fill="#fff"/>
  <rect width="${W}" height="64" fill="#0b1220"/>
  <text x="20" y="30" class="h">${esc(rules.name)}</text>
  <text x="20" y="50" class="k">${esc(name)} · ${esc(coupon.title)}</text>
  ${rows}
  <text x="20" y="${foot + 20}" class="s">Lines</text>
  <text x="${W - 20}" y="${foot + 20}" class="m b" text-anchor="end">${lines}</text>
  <text x="20" y="${foot + 42}" class="s">Stake</text>
  <text x="${W - 20}" y="${foot + 42}" class="m b" text-anchor="end">KES ${(lines * rules.stake).toLocaleString("en-KE")}</text>
  <text x="20" y="${foot + 70}" class="m" fill="#334155">${esc(sms.ok ? sms.messages[0] : "Slip incomplete")}</text>
</svg>`;
}
