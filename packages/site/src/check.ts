// Checks a built site: no page or stylesheet loads anything from the network (INV-3), and every local
// reference names a file the build wrote. Plain <a href> links may point anywhere.

export type Output = string | Uint8Array;

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

interface Ref {
  readonly url: string;
  readonly fetched: boolean;
}

function attrRefs(page: string): Ref[] {
  const refs: Ref[] = [];
  for (const tag of page.matchAll(/<([a-z]+)\b([^>]*)>/gi)) {
    const name = String(tag[1]).toLowerCase();
    const attrs = String(tag[2]);
    for (const a of attrs.matchAll(/\b(href|src|srcset|style)="([^"]*)"/gi)) {
      const attr = String(a[1]).toLowerCase();
      const value = String(a[2]);
      if (attr === "style") refs.push(...cssRefs(value));
      else if (attr === "srcset") for (const c of value.split(",")) refs.push({ url: String(c.trim().split(/\s+/)[0]), fetched: true });
      else refs.push({ url: value, fetched: !(name === "a" && attr === "href") });
    }
  }
  return refs;
}

function cssRefs(css: string): Ref[] {
  const refs: Ref[] = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) refs.push({ url: String(m[2]), fetched: true });
  for (const m of css.matchAll(/@import\s+(['"])([^'"]*)\1/gi)) refs.push({ url: String(m[2]), fetched: true });
  return refs;
}

function resolve(from: string, url: string): string | undefined {
  const parts = from.split("/").slice(0, -1);
  for (const seg of url.split("/")) {
    if (seg === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

export function problems(outputs: ReadonlyMap<string, Output>): string[] {
  const found: string[] = [];
  for (const [path, body] of outputs) {
    if (typeof body !== "string") continue;
    const refs = path.endsWith(".css") ? cssRefs(body) : attrRefs(body);
    for (const { url, fetched } of refs) {
      if (url === "" || url.startsWith("#") || url.startsWith("data:")) continue;
      if (REMOTE.test(url)) {
        if (fetched) found.push(`${path}: network request to "${url}"`);
        continue;
      }
      const local = String(url.split(/[?#]/)[0]);
      const target = resolve(path, local);
      if (target === undefined) found.push(`${path}: "${url}" leaves the site`);
      else if (!outputs.has(target)) found.push(`${path}: "${url}" is not a built file`);
    }
  }
  return found;
}
