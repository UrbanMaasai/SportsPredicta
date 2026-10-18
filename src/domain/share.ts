import type { Coupon, JackpotKind, Outcome, Selections } from "./types";
import { RULES } from "./jackpot";
import { enrichFixture } from "./form";
import { hash } from "./random";

/** Compact, versioned payload carried in a share link's URL fragment. */
interface SharePayload {
  v: 1;
  k: JackpotKind;
  t: string;
  /** home, away, league, kickoff ISO, [odds 1, X, 2], picks e.g. "1X", excluded 0/1 */
  f: [string, string, string, string, [number, number, number], string, 0 | 1][];
}

export const SHARE_PARAM = "slip";

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeShare(coupon: Coupon, selections: Selections, excluded: string[] = []): string {
  const payload: SharePayload = {
    v: 1,
    k: coupon.kind,
    t: coupon.title,
    f: coupon.fixtures.map((x) => [
      x.home,
      x.away,
      x.league,
      x.kickoff,
      [x.odds.home, x.odds.draw, x.odds.away],
      (selections[x.id] ?? []).join(""),
      excluded.includes(x.id) ? 1 : 0,
    ]),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function shareUrl(base: string, coupon: Coupon, selections: Selections, excluded: string[] = []): string {
  return `${base}#${SHARE_PARAM}=${encodeShare(coupon, selections, excluded)}`;
}

export interface DecodedShare {
  coupon: Coupon;
  selections: Selections;
  excluded: string[];
}

/** Decode and validate a share payload. Throws with a readable message when it is malformed. */
export function decodeShare(encoded: string): DecodedShare {
  let p: SharePayload;
  try {
    p = JSON.parse(fromBase64Url(encoded));
  } catch {
    throw new Error("This share link is damaged or incomplete.");
  }
  if (p?.v !== 1 || !(p.k in RULES) || !Array.isArray(p.f)) throw new Error("Unsupported share link.");
  if (p.f.length !== RULES[p.k].legs) throw new Error(`A ${RULES[p.k].shortName} link must carry ${RULES[p.k].legs} fixtures.`);
  const id = `${p.k}-share-${hash(encoded).toString(36)}`;
  const selections: Selections = {};
  const excluded: string[] = [];
  const fixtures = p.f.map(([home, away, league, kickoff, [h, d, a], picks, ex], i) => {
    if (typeof home !== "string" || typeof away !== "string" || isNaN(Date.parse(kickoff)) || ![h, d, a].every((o) => o > 1)) {
      throw new Error(`Fixture ${i + 1} in the link is invalid.`);
    }
    const fid = `${id}-${i + 1}`;
    selections[fid] = [...new Set([...String(picks)].filter((c): c is Outcome => c === "1" || c === "X" || c === "2"))];
    if (ex) excluded.push(fid);
    return enrichFixture({ id: fid, leg: i + 1, home, away, league, kickoff, odds: { home: h, draw: d, away: a }, source: "import" });
  });
  return {
    coupon: { kind: p.k, id, title: String(p.t ?? RULES[p.k].name), fixtures, fetchedAt: new Date().toISOString() },
    selections,
    excluded,
  };
}

/** Pull the share payload out of a URL hash like `#slip=...`. */
export function shareFromHash(hashStr: string): string | null {
  const m = hashStr.match(new RegExp(`[#&]${SHARE_PARAM}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
}
