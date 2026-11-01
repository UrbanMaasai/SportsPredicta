import { GoogleGenAI, Type } from "@google/genai";
import type { JackpotKind } from "../src/domain/types";
import { RULES } from "../src/domain/jackpot";
import { sanitizeRaw, type RawFixture } from "../src/domain/parser";

/** Default model; override with GEMINI_MODEL. */
export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
/** Tried in order if the configured model has been retired or renamed. */
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];

export class ConfigError extends Error {}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ConfigError("GEMINI_API_KEY is not configured on the server.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

type GenerateParams = Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">;

/** A retired/unknown model surfaces as 404 / NOT_FOUND / "is not supported". */
export function isModelUnavailable(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return e?.status === 404 || /not[ _]found|is not supported|no longer available|deprecated/i.test(String(e?.message ?? ""));
}

/** generateContent with the configured model, falling back to a current Flash alias if it was retired. */
async function generate(params: GenerateParams) {
  const models = [MODEL, ...FALLBACK_MODELS.filter((m) => m !== MODEL)];
  let last: unknown;
  for (const model of models) {
    try {
      return await ai().models.generateContent({ ...params, model });
    } catch (err) {
      last = err;
      if (!isModelUnavailable(err)) throw err;
      console.warn(`[gemini] model ${model} unavailable, trying the next one`);
    }
  }
  throw last;
}

const FIXTURE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      home: { type: Type.STRING },
      away: { type: Type.STRING },
      league: { type: Type.STRING },
      kickoff: { type: Type.STRING, description: "ISO-8601 with Africa/Nairobi offset (+03:00)" },
      odds: {
        type: Type.OBJECT,
        nullable: true,
        description: "Only if 1-X-2 decimal odds are printed. Omit or null when they are not shown — never estimate.",
        properties: { home: { type: Type.NUMBER }, draw: { type: Type.NUMBER }, away: { type: Type.NUMBER } },
        required: ["home", "draw", "away"],
      },
    },
    required: ["home", "away"],
  },
};

/**
 * Pull the fixture list out of a free-text model response. Grounded answers wrap JSON in prose and
 * citation marks like "[1]", so try a fenced block first, then every "[" until one parses to an array
 * (or an object with a `fixtures` array).
 */
export function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const bodies = fenced ? [fenced[1], text] : [text];
  let fallback: unknown[] | undefined;
  for (const body of bodies) {
    const trimmed = body.trim();
    if (trimmed.startsWith("{")) {
      try {
        const obj = JSON.parse(trimmed) as { fixtures?: unknown };
        if (Array.isArray(obj.fixtures)) return obj.fixtures;
      } catch {
        /* fall through */
      }
    }
    const positions = (ch: string) => [...body.matchAll(new RegExp(`\\${ch}`, "g"))].map((m) => m.index!).slice(0, 60);
    const starts = positions("[");
    const ends = positions("]").reverse();
    // Prefer the first array of objects (a fixture list); citation marks like [1] are arrays of numbers.
    for (const start of starts) {
      for (const end of ends) {
        if (end <= start) continue;
        try {
          const parsed = JSON.parse(body.slice(start, end + 1));
          if (!Array.isArray(parsed)) continue;
          if (parsed.length > 0 && parsed.every((x) => x && typeof x === "object")) return parsed;
          fallback ??= parsed;
        } catch {
          /* not this span */
        }
      }
    }
  }
  if (fallback) return fallback;
  throw new Error("Model response did not contain a JSON array.");
}

function describe(kind: JackpotKind): string {
  const r = RULES[kind];
  return kind === "MJP17"
    ? `the SportPesa Kenya ${r.name} (${r.legs} matches, usually played over the weekend)`
    : `the SportPesa Kenya ${r.name} (${r.legs} matches, played midweek)`;
}

export interface LiveResult {
  fixtures: RawFixture[];
  sources: { title: string; uri: string }[];
}

/** Live search scraper: Gemini with Google Search grounding against ke.sportpesa.com. */
export async function scrapeLive(kind: JackpotKind, now = new Date()): Promise<LiveResult> {
  const r = RULES[kind];
  const prompt = [
    `Today is ${now.toISOString().slice(0, 10)} (Africa/Nairobi, UTC+3).`,
    `Find the CURRENT, UPCOMING ${describe(kind)} coupon: the ${r.legs} matches for the next draw that has not started yet.`,
    "Use SportPesa Kenya (ke.sportpesa.com jackpot pages) first; jackpot prediction and tips sites that list the same coupon are acceptable if SportPesa itself isn't indexed.",
    `Only include matches kicking off after ${now.toISOString()}. Never return a concluded or past coupon.`,
    `List the matches in coupon order (all ${r.legs} if you can find them).`,
    "For each match give: home, away, league, kickoff (ISO-8601 with +03:00).",
    "Give odds {home, draw, away} (decimal 1-X-2) ONLY if a source shows them for that match; otherwise omit odds. Never estimate odds.",
    'If you can find them, add homeForm and awayForm: the last five results as "W","D","L", oldest first.',
    "Respond with ONLY a JSON array of objects, no prose and no citation marks.",
  ].join("\n");
  const res = await generate({
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], temperature: 0 },
  });
  const text = res.text ?? "";
  let parsed: unknown;
  try {
    parsed = extractJsonArray(text);
  } catch (err) {
    console.warn("[gemini] live search returned no JSON:", text.slice(0, 500));
    throw err;
  }
  const fixtures = sanitizeRaw(parsed, now).filter((f) => !f.kickoff || new Date(f.kickoff).getTime() > now.getTime());
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => ({ title: c.web?.title ?? c.web?.uri ?? "", uri: c.web?.uri ?? "" }))
    .filter((s) => s.uri);
  return { fixtures, sources };
}

/** Vision OCR: structured fixtures from a coupon screenshot. */
export async function ocrCoupon(imageBase64: string, mimeType: string, now = new Date()): Promise<RawFixture[]> {
  const res = await generate({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          {
            text:
              `This is a screenshot of a SportPesa jackpot coupon (it may show only part of the coupon). Today is ${now.toISOString().slice(0, 10)}, Africa/Nairobi (UTC+3). ` +
              "Extract every match row visible, top to bottom: home team, away team, league if shown, and kickoff as ISO-8601 with +03:00. " +
              `If the screen shows only a day and month (or a weekday), use the upcoming date nearest to today in ${now.getUTCFullYear()} or ${now.getUTCFullYear() + 1}. ` +
              "Include the decimal 1-X-2 odds only if they are printed for that match; jackpot coupons often show just 1 / X / 2 boxes — then leave odds out. " +
              "Never invent odds, teams or times. Ignore headers, banners, bet slips and buttons.",
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json", responseSchema: FIXTURE_SCHEMA, temperature: 0 },
  });
  const text = res.text ?? "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = extractJsonArray(text);
  }
  return sanitizeRaw(parsed, now);
}

/** AI fallback for messy pasted text the local parser could not handle. */
export async function parseTextAI(text: string, now = new Date()): Promise<RawFixture[]> {
  const res = await generate({
    contents:
      `Today is ${now.toISOString().slice(0, 10)} (Africa/Nairobi, UTC+3). Convert this copied SportPesa jackpot coupon into fixtures ` +
      `(home, away, league, kickoff ISO-8601 +03:00). Include decimal 1-X-2 odds only where the text has them; never invent odds. Text:\n\n${text.slice(0, 20_000)}`,
    config: { responseMimeType: "application/json", responseSchema: FIXTURE_SCHEMA, temperature: 0 },
  });
  return sanitizeRaw(JSON.parse(res.text ?? "[]"), now);
}

/**
 * Results lookup: full-time scores for a coupon's fixtures, and the bonus payouts SportPesa
 * published for the round, via Google Search grounding. Returned raw; the client validates it.
 */
export async function fetchResults(
  kind: JackpotKind,
  fixtures: { home: string; away: string; kickoff: string }[],
  now = new Date(),
): Promise<{ matches: unknown[]; payouts: Record<string, number>; sources: { title: string; uri: string }[] }> {
  const r = RULES[kind];
  const list = fixtures.map((f, i) => `${i}. ${f.home} vs ${f.away} — kickoff ${f.kickoff}`).join("\n");
  const tiers = [r.legs, ...r.subTiers].join(", ");
  const prompt = [
    `Today is ${now.toISOString().slice(0, 10)}. These fixtures formed ${describe(kind)}:`,
    list,
    "For each fixture give the official full-time result (90 minutes plus stoppage time — jackpot settles on that).",
    'Use status "FT" only when the match was played and finished; "postponed", "abandoned" or "not_played" otherwise. Never guess a score.',
    `Also give the prize per winning line SportPesa published for this round, for tiers ${tiers} correct, in KES, if you can find it.`,
    'Respond with ONLY JSON: {"matches":[{"index":0,"homeGoals":2,"awayGoals":1,"status":"FT"}],"payouts":{"17":0,"16":123456}}',
  ].join("\n");
  const res = await generate({
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], temperature: 0 },
  });
  const text = res.text ?? "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model response did not contain JSON.");
  const parsed = JSON.parse(body.slice(start, end + 1)) as { matches?: unknown[]; payouts?: Record<string, number> };
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return {
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    payouts: parsed.payouts && typeof parsed.payouts === "object" ? parsed.payouts : {},
    sources: chunks.map((c) => ({ title: c.web?.title ?? c.web?.uri ?? "", uri: c.web?.uri ?? "" })).filter((x) => x.uri),
  };
}

/**
 * Market odds lookup for fixtures whose coupon printed none (SportPesa's jackpot page usually doesn't).
 * Searches for current decimal 1-X-2 prices — SportPesa's own match markets first, then other Kenyan
 * bookmakers — and returns only what it found; the client validates and marks them as looked-up.
 */
export async function fetchOdds(
  fixtures: { home: string; away: string; kickoff: string }[],
  now = new Date(),
): Promise<{ odds: { index: number; home: number; draw: number; away: number; bookmaker?: string }[]; sources: { title: string; uri: string }[] }> {
  const list = fixtures.map((f, i) => `${i}. ${f.home} vs ${f.away} — kickoff ${f.kickoff}`).join("\n");
  const prompt = [
    `Today is ${now.toISOString().slice(0, 10)} (Africa/Nairobi). Find the current pre-match 1X2 (full-time result) decimal odds for these football matches:`,
    list,
    "Prefer SportPesa Kenya's own match odds; otherwise use another bookmaker (Betika, Odibets, Bet365, …) and name it.",
    "Only include a match when you found real odds for it. Never estimate.",
    'Respond with ONLY JSON: {"odds":[{"index":0,"home":1.85,"draw":3.4,"away":4.2,"bookmaker":"SportPesa"}]}',
  ].join("\n");
  const res = await generate({ contents: prompt, config: { tools: [{ googleSearch: {} }], temperature: 0 } });
  const text = res.text ?? "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model response did not contain JSON.");
  const parsed = JSON.parse(body.slice(start, end + 1)) as { odds?: unknown[] };
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return {
    odds: (Array.isArray(parsed.odds) ? parsed.odds : []) as { index: number; home: number; draw: number; away: number; bookmaker?: string }[],
    sources: chunks.map((c) => ({ title: c.web?.title ?? c.web?.uri ?? "", uri: c.web?.uri ?? "" })).filter((x) => x.uri),
  };
}
