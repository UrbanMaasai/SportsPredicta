import { useState } from "react";
import type { Coupon, JackpotKind } from "../../domain/types";
import { RULES } from "../../domain/jackpot";
import { applyLookedUpOdds, mergeRaw, parseCouponText, toFixtures, type RawFixture } from "../../domain/parser";
import { upcomingOnly, upcomingSlots, weekKey } from "../../domain/fixtures";
import { api, readFileAsDataUrl } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

type Tab = "live" | "ocr" | "text";
type Source = "live" | "ocr" | "text";

export function buildCoupon(kind: JackpotKind, raw: RawFixture[], source: Source, now = new Date()): { coupon: Coupon | null; error?: string; dropped: number } {
  const rules = RULES[kind];
  const id = `${kind}-${source}-${now.getTime()}`;
  const fixtures = toFixtures(raw, source, id, upcomingSlots(kind, now)[0]);
  const upcoming = upcomingOnly(fixtures, now);
  const dropped = fixtures.length - upcoming.length;
  if (upcoming.length < rules.legs) {
    return {
      coupon: null,
      dropped,
      error: `${upcoming.length} of ${rules.legs} fixtures${dropped ? ` (${dropped} already kicked off and left out)` : ""}.`,
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

const fmtKickoff = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "time not shown");

export function ImportModal({ open, onClose, kind, onLoad }: { open: boolean; onClose: () => void; kind: JackpotKind; onLoad: (c: Coupon) => void }) {
  const rules = RULES[kind];
  const [tab, setTab] = useState<Tab>("live");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Everything found so far, from any method — screenshots, searches and pasted text all add to it. */
  const [raw, setRaw] = useState<RawFixture[]>([]);
  const [source, setSource] = useState<Source>("live");
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [text, setText] = useState("");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** Add newly read fixtures to the list and say what changed. */
  const add = (found: RawFixture[], from: Source, what: string, rowsRead = found.length) => {
    const before = raw.length;
    const merged = mergeRaw(raw, found);
    setRaw(merged);
    setSource(from);
    const added = merged.length - before;
    const repeats = rowsRead - added;
    setNote(
      rowsRead === 0
        ? `${what}: no matches found.`
        : `${what}: ${rowsRead} match${rowsRead === 1 ? "" : "es"} read, ${added} new${repeats ? `, ${repeats} already listed` : ""}.`,
    );
  };

  const missingOdds = raw.map((f, i) => (f.odds ? -1 : i)).filter((i) => i >= 0);
  const built = raw.length ? buildCoupon(kind, raw, source) : null;
  const count = built ? (built.coupon ? rules.legs : raw.length - built.dropped) : 0;
  const busyText = busy ? `${busy}…` : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title={`Load ${rules.name} fixtures`}
      subtitle="Search, screenshots and pasted text all add to one list — combine them until all fixtures are in. Past fixtures are left out."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!built?.coupon || Boolean(busy)}
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
          { value: "ocr", label: "Screenshots" },
          { value: "text", label: "Paste text" },
        ]}
      />

      <div className="mt-4">
        {tab === "live" && (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">
              Searches the web (SportPesa first) for the current upcoming {rules.name} coupon. Search results can lag behind SportPesa — if it comes back
              short or stale, add screenshots of the coupon from the SportPesa app.
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-primary"
                disabled={Boolean(busy)}
                onClick={() =>
                  run("Searching", async () => {
                    const r = await api.live(kind);
                    add(r.fixtures, "live", "Live search");
                    setSources(r.sources);
                  })
                }
              >
                {busy === "Searching" ? busyText : "Search live coupon"}
              </button>
              {sources.length > 0 && (
                <button
                  className="btn"
                  disabled={Boolean(busy)}
                  title="Results are reused for 10 minutes; this forces a new search"
                  onClick={() =>
                    run("Searching", async () => {
                      const r = await api.live(kind, true);
                      add(r.fixtures, "live", "Fresh search");
                      setSources(r.sources);
                    })
                  }
                >
                  Search again
                </button>
              )}
            </div>
          </div>
        )}
        {tab === "ocr" && (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">
              A phone screen shows only part of a {rules.legs}-match coupon. Take screenshots while scrolling down the coupon and add them all — you can
              pick several at once or add more later. Repeats are merged.
            </p>
            <label className="btn btn-primary cursor-pointer" aria-disabled={Boolean(busy)}>
              {busy?.startsWith("Reading") ? busyText : raw.length && source === "ocr" ? "Add more screenshots" : "Choose screenshots"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                disabled={Boolean(busy)}
                aria-label="Coupon screenshots"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = ""; // allow re-adding the same file
                  if (!files.length) return;
                  run("Reading screenshots", async () => {
                    let all: RawFixture[] = [];
                    let rows = 0;
                    const perFile: string[] = [];
                    for (const [i, file] of files.entries()) {
                      setBusy(`Reading screenshot ${i + 1} of ${files.length}`);
                      const r = await api.ocr(await readFileAsDataUrl(file), file.type);
                      perFile.push(`${r.fixtures.length}`);
                      rows += r.fixtures.length;
                      all = mergeRaw(all, r.fixtures);
                    }
                    add(all, "ocr", files.length === 1 ? "Screenshot" : `${files.length} screenshots (${perFile.join(" + ")} rows)`, rows);
                  });
                }}
              />
            </label>
          </div>
        )}
        {tab === "text" && (
          <div className="space-y-2">
            <textarea
              className="input num h-40 w-full py-2 text-[13px]"
              placeholder={"1. Arsenal vs Chelsea 08/11 17:00 1.85 3.40 4.20\n2. Inter - Roma 08/11 19:00\n(odds are optional)"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Coupon text"
            />
            <div className="flex gap-2">
              <button
                className="btn btn-primary"
                disabled={!text.trim() || Boolean(busy)}
                onClick={() => {
                  setError(null);
                  const r = parseCouponText(text);
                  if (r.length === 0) setError("No fixtures recognised. Each line needs two teams (\"A vs B\"), plus a leg number, date or odds. Try AI parse.");
                  else add(r, "text", "Pasted text");
                }}
              >
                Parse
              </button>
              <button
                className="btn"
                disabled={!text.trim() || Boolean(busy)}
                onClick={() =>
                  run("Parsing", async () => {
                    const r = await api.parse(text);
                    add(r.fixtures, "text", r.engine === "gemini" ? "AI parse" : "Parse");
                  })
                }
              >
                {busy === "Parsing" ? busyText : "AI parse"}
              </button>
            </div>
          </div>
        )}
      </div>

      {busy && busy !== "Searching" && busy !== "Parsing" && !busy.startsWith("Reading") && <p className="meta mt-3">{busyText}</p>}
      {error && <p className="mt-4 text-sm text-bad" role="alert">{error}</p>}
      {note && !error && <p className="meta mt-3" role="status">{note}</p>}

      {raw.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className={`num font-semibold ${built?.coupon ? "text-good" : "text-warn"}`}>
                {count} of {rules.legs}
              </span>{" "}
              fixtures ready
              {built?.dropped ? <span className="meta"> · {built.dropped} already kicked off (left out)</span> : null}
              {raw.length - (built?.dropped ?? 0) > rules.legs && <span className="meta"> · only the first {rules.legs} are used — remove extras</span>}
            </p>
            <button className="btn btn-ghost h-7 text-xs" onClick={() => (setRaw([]), setNote(null), setSources([]))}>
              Clear list
            </button>
          </div>

          {!built?.coupon && (
            <p className="mb-2 text-sm text-ink-2">
              {rules.legs - count} more needed. {tab === "ocr" ? "Add a screenshot of the rest of the coupon" : "Add screenshots of the coupon"}, search again, or paste the
              missing matches.
            </p>
          )}

          {missingOdds.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm">
              <span>
                <span className="num font-semibold">{missingOdds.length}</span> fixture{missingOdds.length === 1 ? " has" : "s have"} no odds — SportPesa's
                jackpot coupon usually doesn't show them. Strategies need odds; without them those legs are treated as evenly matched.
              </span>
              <button
                className="btn h-7"
                disabled={Boolean(busy)}
                onClick={() =>
                  run("Finding odds", async () => {
                    const targets = missingOdds.slice(0, 17);
                    const r = await api.odds(targets.map((i) => ({ home: raw[i].home, away: raw[i].away, kickoff: raw[i].kickoff ?? new Date().toISOString() })));
                    const { raw: next, filled } = applyLookedUpOdds(raw, targets, r);
                    setRaw(next);
                    setNote(filled ? `Found market odds for ${filled} of ${targets.length} fixtures.` : "No market odds found yet — try again closer to kickoff.");
                    if (r.sources.length) setSources(r.sources);
                  })
                }
              >
                {busy === "Finding odds" ? busyText : "Find market odds"}
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <tbody>
                {raw.map((f, i) => (
                  <tr key={`${f.home}|${f.away}`} className="border-b border-line last:border-0">
                    <td className="num w-8 px-3 py-1.5 text-ink-3">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      {f.home} <span className="text-ink-3">v</span> {f.away}
                      {f.league && <span className="meta block">{f.league}</span>}
                    </td>
                    <td className={`num px-3 py-1.5 ${f.kickoff ? "text-ink-2" : "text-warn"}`}>{fmtKickoff(f.kickoff)}</td>
                    <td className="num px-3 py-1.5 text-right">
                      {f.odds ? (
                        `${f.odds.home.toFixed(2)} · ${f.odds.draw.toFixed(2)} · ${f.odds.away.toFixed(2)}`
                      ) : (
                        <span className="text-warn">no odds</span>
                      )}
                    </td>
                    <td className="w-8 px-2 text-right">
                      <button
                        className="text-ink-3 hover:text-bad"
                        onClick={() => setRaw(raw.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.home} v ${f.away}`}
                        title="Remove this row"
                      >
                        ✕
                      </button>
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
