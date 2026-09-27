export type Outcome = "1" | "X" | "2";
export const OUTCOMES: readonly Outcome[] = ["1", "X", "2"] as const;

export type JackpotKind = "MJP17" | "MID13";

/** A single W/D/L result from a team's perspective, most recent last. */
export type FormResult = "W" | "D" | "L";

export interface Odds {
  home: number;
  draw: number;
  away: number;
}

export interface Fixture {
  id: string;
  /** 1-based position on the coupon. */
  leg: number;
  home: string;
  away: string;
  league: string;
  /** ISO-8601 kickoff timestamp. */
  kickoff: string;
  odds: Odds;
  /** Last five results, oldest first. */
  homeForm: FormResult[];
  awayForm: FormResult[];
  /** Recent head-to-head goal margins from the home side's perspective (positive = home won). */
  h2h: number[];
  /** Where the fixture came from. `modelled` fields are derived, not scraped. */
  source: "seed" | "live" | "ocr" | "text" | "import";
  /** True when form/h2h were modelled from odds rather than supplied by the source. */
  formModelled: boolean;
}

export interface Coupon {
  kind: JackpotKind;
  id: string;
  title: string;
  fixtures: Fixture[];
  fetchedAt: string;
}

/** Selected outcomes per leg, keyed by fixture id. */
export type Selections = Record<string, Outcome[]>;

export type StrategyId = "favorites" | "balanced" | "bold";

export interface Slip {
  id: string;
  kind: JackpotKind;
  couponId: string;
  name: string;
  strategy: StrategyId | "custom";
  selections: Selections;
  /** Fixture ids excluded for sub-jackpot tier play (MJP only). */
  excluded: string[];
  createdAt: string;
  updatedAt: string;
}
