import { useState } from "react";
import type { Coupon, JackpotKind } from "../../domain/types";
import { RULES } from "../../domain/jackpot";
import { parseCouponText, toFixtures, type RawFixture } from "../../domain/parser";
import { upcomingOnly, upcomingSlots, weekKey } from "../../domain/fixtures";
import { api, readFileAsDataUrl } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

type Tab = "live" | "ocr" | "text";

export function buildCoupon(kind: JackpotKind, raw: RawFixture[], source: "live" | "ocr" | "text", now = new Date()): { coupon: Coupon | null; error?: string; dropped: number } {
  const rules = RULES[kind];
  const id = `${kind}-${source}-${now.getTime()}`;
  const fixtures = toFixtures(raw, source, id, upcomingSlots(kind, now)[0]);
  const upcoming = upcomingOnly(fixtures, now);
  const dropped = fixtures.length - upcoming.length;
  if (upcoming.length < rules.legs) {
    return {
      coupon: null,
      dropped,
      error: `Found ${upcoming.length} upcoming fixture${upcoming.length === 1 ? "" : "s"}${dropped ? ` (${dropped} already kicked off)` : ""}; ${rules.shortName} needs ${rules.legs}.`,
    };
  }
  const legs = upcoming.slice(0, rules.legs);
  return {
    dropped,
    coupon: {
      kind,
      id,
      title: `${rules.name} · ${weekKey(new Date(legs[0].kickoff))}`,
      fixtures: legs,
      fetchedAt: now.toISOString(),
    },
  };
}

export function ImportModal({ open, onClose, kind, onLoad }: { open: boolean; onClose: () => void; kind: JackpotKind; onLoad: (c: Coupon) => void }) {
  const rules = RULES[kind];
  const [tab, setTab] = useState<Tab>("live");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<RawFixture[] | null>(null);
  const [source, setSource] = useState<"live" | "ocr" | "text">("live");
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [text, setText] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const built = raw ? buildCoupon(kind, raw, source) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Load ${rules.name} fixtures`}
      subtitle="Live search, a screenshot of the coupon, or pasted text. Past fixtures are dropped automatically."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!built?.coupon}
            onClick={() => {
              if (built?.coupon) {
                onLoad(built.coupon);
                onClose();
              }
            }}
          >
            Load {rules.legs} fixtures
          </button>
        </>
      }
    >
      <Segmented
        label="Import source"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setError(null);
        }}
        options={[
          { value: "live", label: "Live search" },
          { value: "ocr", label: "Screenshot" },
          { value: "text", label: "Paste text" },
        ]}
      />

      <div className="mt-4">
        {tab === "live" && (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">
              Searches ke.sportpesa.com with Google Search grounding for the current upcoming {rules.name} coupon.
            </p>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await api.live(kind);
                  setRaw(r.fixtures);
                  setSources(r.sources);
                  setSource("live");
                })
              }
            >
              {busy ? "Searching…" : "Search live coupon"}
            </button>
          </div>
        )}
        {tab === "ocr" && (
          <label className="block">
            <span className="text-sm text-ink-2">Upload a PNG, JPEG or WebP screenshot of the jackpot coupon.</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 block text-sm"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                run(async () => {
                  const data = await readFileAsDataUrl(file);
                  const r = await api.ocr(data, file.type);
                  setRaw(r.fixtures);
                  setSources([]);
                  setSource("ocr");
                });
              }}
            />
            {busy && <p className="meta mt-2">Reading coupon…</p>}
          </label>
        )}
        {tab === "text" && (
          <div className="space-y-2">
            <textarea
              className="input num h-40 w-full py-2 text-[13px]"
              placeholder={"1. Arsenal vs Chelsea 04/10 17:00 1.85 3.40 4.20\n2. Inter - Roma 2.10 3.30 3.50"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Coupon text"
            />
            <div className="flex gap-2">
              <button
                className="btn btn-primary"
                disabled={!text.trim() || busy}
                onClick={() => {
                  const r = parseCouponText(text);
                  setRaw(r);
                  setSources([]);
                  setSource("text");
                  setError(r.length === 0 ? "No fixtures recognised. Try AI parse." : null);
                }}
              >
                Parse
              </button>
              <button
                className="btn"
                disabled={!text.trim() || busy}
                onClick={() =>
                  run(async () => {
                    const r = await api.parse(text);
                    setRaw(r.fixtures);
                    setSource("text");
                  })
                }
              >
                AI parse
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-bad" role="alert">{error}</p>}

      {raw && (
        <div className="mt-4">
          <p className="meta mb-2">
            <span className="num">{raw.length}</span> fixtures recognised
            {built?.dropped ? (
              <>
                <span className="sep" />
                <span className="num">{built.dropped}</span> already kicked off
              </>
            ) : null}
            {built?.error && (
              <>
                <span className="sep" />
                <span className="text-bad">{built.error}</span>
              </>
            )}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <tbody>
                {raw.map((f, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="num px-3 py-1.5 text-ink-3">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      {f.home} <span className="text-ink-3">v</span> {f.away}
                    </td>
                    <td className="num px-3 py-1.5 text-ink-2">{f.kickoff ? new Date(f.kickoff).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                    <td className="num px-3 py-1.5 text-right">
                      {f.odds.home.toFixed(2)} · {f.odds.draw.toFixed(2)} · {f.odds.away.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sources.length > 0 && (
            <p className="meta mt-2">
              Sources:{" "}
              {sources.slice(0, 4).map((s, i) => (
                <span key={s.uri} className={i ? "sep" : undefined}>
                  <a className="underline" href={s.uri} target="_blank" rel="noreferrer">
                    {s.title || new URL(s.uri).hostname}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
