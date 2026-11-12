// Markup built with html`` escapes every interpolated string, so data text can never become markup.

export class Html {
  constructor(readonly value: string) {}
}

export type Part = Html | string | number | readonly Html[];

export function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function part(p: Part): string {
  if (p instanceof Html) return p.value;
  if (typeof p === "number") return String(p);
  if (typeof p === "string") return esc(p);
  return p.map((h) => h.value).join("");
}

export function html(strings: TemplateStringsArray, ...parts: readonly Part[]): Html {
  const rendered = parts.map(part);
  return new Html(strings.reduce((out, s, i) => out + String(rendered[i - 1]) + s));
}

export function join(items: readonly Html[], separator: string): Html {
  return new Html(items.map((h) => h.value).join(separator));
}

export function raw(trusted: string): Html {
  return new Html(trusted);
}
