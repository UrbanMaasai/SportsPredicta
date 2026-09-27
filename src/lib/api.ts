import type { RawFixture } from "../domain/parser";
import type { JackpotKind } from "../domain/types";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  live: (kind: JackpotKind) => post<{ fixtures: RawFixture[]; sources: { title: string; uri: string }[] }>("/api/fixtures/live", { kind }),
  ocr: (image: string, mimeType: string) => post<{ fixtures: RawFixture[] }>("/api/fixtures/ocr", { image, mimeType }),
  parse: (text: string) => post<{ fixtures: RawFixture[]; engine: string }>("/api/fixtures/parse", { text }),
};

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
export const kesCompact = (n: number) =>
  n >= 1e6 ? `KES ${(n / 1e6).toLocaleString("en-KE", { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `KES ${Math.round(n / 1e3)}K` : kes(n);
export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
