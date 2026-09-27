import { GoogleGenAI, Type } from "@google/genai";
import type { JackpotKind } from "../src/domain/types";
import { RULES } from "../src/domain/jackpot";
import { sanitizeRaw, type RawFixture } from "../src/domain/parser";

export const MODEL = "gemini-2.5-flash";

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
        properties: { home: { type: Type.NUMBER }, draw: { type: Type.NUMBER }, away: { type: Type.NUMBER } },
        required: ["home", "draw", "away"],
      },
    },
    required: ["home", "away", "odds"],
  },
};

/** Pull the first JSON array out of a free-text model response. */
export function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Model response did not contain a JSON array.");
  return JSON.parse(body.slice(start, end + 1));
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
    `Today is ${now.toISOString().slice(0, 10)} (Africa/Nairobi).`,
    `Find the CURRENT, UPCOMING ${describe(kind)} coupon published on ke.sportpesa.com (jackpot pages).`,
    `Only include fixtures whose kickoff is after ${now.toISOString()}. Never return a concluded or past coupon.`,
    `Return exactly ${r.legs} fixtures in coupon order if available.`,
    `For each fixture give: home, away, league, kickoff (ISO-8601 with +03:00), odds {home, draw, away} as decimal 1-X-2 prices,`,
    `and if you can find them, homeForm and awayForm as arrays of the last five results ("W","D","L", oldest first).`,
    `Respond with ONLY a JSON array, no prose.`,
  ].join("\n");
  const res = await ai().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], temperature: 0 },
  });
  const fixtures = sanitizeRaw(extractJsonArray(res.text ?? "")).filter(
    (f) => !f.kickoff || new Date(f.kickoff).getTime() > now.getTime(),
  );
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => ({ title: c.web?.title ?? c.web?.uri ?? "", uri: c.web?.uri ?? "" }))
    .filter((s) => s.uri);
  return { fixtures, sources };
}

/** Vision OCR: structured fixtures from a coupon screenshot. */
export async function ocrCoupon(imageBase64: string, mimeType: string, now = new Date()): Promise<RawFixture[]> {
  const res = await ai().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          {
            text: `This is a screenshot of a SportPesa jackpot coupon. Today is ${now.toISOString().slice(0, 10)}. ` +
              "Extract every fixture in order: home team, away team, league (if shown), kickoff date/time as ISO-8601 " +
              "with +03:00 (assume the upcoming date if the year is not shown), and the three decimal 1-X-2 odds.",
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json", responseSchema: FIXTURE_SCHEMA, temperature: 0 },
  });
  return sanitizeRaw(JSON.parse(res.text ?? "[]"));
}

/** AI fallback for messy pasted text the local parser could not handle. */
export async function parseTextAI(text: string, now = new Date()): Promise<RawFixture[]> {
  const res = await ai().models.generateContent({
    model: MODEL,
    contents:
      `Today is ${now.toISOString().slice(0, 10)}. Convert this copied SportPesa jackpot coupon into fixtures ` +
      `(home, away, league, kickoff ISO-8601 +03:00, decimal 1-X-2 odds). Text:\n\n${text.slice(0, 20_000)}`,
    config: { responseMimeType: "application/json", responseSchema: FIXTURE_SCHEMA, temperature: 0 },
  });
  return sanitizeRaw(JSON.parse(res.text ?? "[]"));
}
