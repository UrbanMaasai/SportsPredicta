import { useState } from "react";
import type { Coupon, Selections } from "../../domain/types";
import type { JackpotRules } from "../../domain/jackpot";
import { combinations } from "../../domain/jackpot";
import { formatSms, formatTelegram, SMS_SHORTCODE, toCsv, toJson } from "../../domain/export";
import { ticketSvg } from "../../domain/ticket";
import { copyText, download, kes } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

type Tab = "sms" | "telegram" | "json" | "csv" | "ticket";

async function svgToPng(svg: string): Promise<string> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("Could not render ticket"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width * 2;
  canvas.height = img.height * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/png");
}

export function ExportModal({
  open,
  onClose,
  coupon,
  selections,
  excluded,
  rules,
  slipName,
}: {
  open: boolean;
  onClose: () => void;
  coupon: Coupon;
  selections: Selections;
  excluded: string[];
  rules: JackpotRules;
  slipName: string;
}) {
  const [tab, setTab] = useState<Tab>("sms");
  const [copied, setCopied] = useState<string | null>(null);
  const sms = formatSms(selections, coupon.fixtures, rules);
  const telegram = formatTelegram(coupon, selections, rules, slipName);
  const json = JSON.stringify(toJson(coupon, selections, rules, excluded), null, 2);
  const csv = toCsv(coupon, selections);
  const svg = ticketSvg(coupon, selections, rules, slipName);
  const lines = combinations(selections, coupon.fixtures);
  const base = `${rules.kind.toLowerCase()}-${coupon.id}`;

  const copy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  const block = (text: string) => <pre className="num max-h-80 overflow-auto rounded-md bg-sunken p-3 text-[12px] leading-relaxed whitespace-pre-wrap">{text}</pre>;

  return (
    <Modal open={open} onClose={onClose} title="Export slip" subtitle={`${rules.name} · ${lines} lines · ${kes(lines * rules.stake)}`}>
      <Segmented
        label="Export format"
        value={tab}
        onChange={setTab}
        options={[
          { value: "sms", label: "SMS" },
          { value: "telegram", label: "Telegram" },
          { value: "json", label: "JSON" },
          { value: "csv", label: "CSV" },
          { value: "ticket", label: "Ticket" },
        ]}
      />
      <div className="mt-4 space-y-3">
        {tab === "sms" &&
          (sms.ok ? (
            <>
              <p className="text-sm text-ink-2">
                Send {sms.messages.length === 1 ? "this code" : `each of these ${sms.messages.length} codes`} to <span className="num font-semibold">{SMS_SHORTCODE}</span>.
                {sms.messages.length > 1 && " SMS accepts one pick per leg, so every combination line is its own message."}
              </p>
              {block(sms.messages.join("\n"))}
              <button className="btn btn-primary" onClick={() => copy("sms", sms.messages.join("\n"))}>
                {copied === "sms" ? "Copied" : "Copy to clipboard"}
              </button>
            </>
          ) : (
            <ul className="space-y-1 text-sm text-bad" role="alert">
              {sms.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ))}
        {tab === "telegram" && (
          <>
            {block(telegram)}
            <button className="btn btn-primary" onClick={() => copy("tg", telegram)}>
              {copied === "tg" ? "Copied" : "Copy for Telegram"}
            </button>
          </>
        )}
        {tab === "json" && (
          <>
            {block(json)}
            <button className="btn btn-primary" onClick={() => download(`${base}.json`, json, "application/json")}>
              Download JSON
            </button>
          </>
        )}
        {tab === "csv" && (
          <>
            {block(csv)}
            <button className="btn btn-primary" onClick={() => download(`${base}.csv`, csv, "text/csv")}>
              Download CSV
            </button>
          </>
        )}
        {tab === "ticket" && (
          <>
            <div className="print-ticket flex justify-center rounded-md bg-sunken p-4" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => window.print()}>
                Print
              </button>
              <button
                className="btn"
                onClick={async () => {
                  const png = await svgToPng(svg);
                  const a = document.createElement("a");
                  a.href = png;
                  a.download = `${base}.png`;
                  a.click();
                }}
              >
                Save PNG
              </button>
              <button className="btn" onClick={() => download(`${base}.svg`, svg, "image/svg+xml")}>
                Save SVG
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
