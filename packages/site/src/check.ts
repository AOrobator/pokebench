// Checks a built site: no page or stylesheet loads anything from the network (INV-3), and every local
// reference names a file the build wrote. Plain <a href> links may point anywhere. It fails closed: any
// attribute value holding a network URL counts as a request unless it is an <a href>.

export type Output = string | Uint8Array;

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const REMOTE_INSIDE = /(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>;,)]+/i;
const TAG = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
const ATTR = /([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
// Attributes whose value is a URL the browser fetches or navigates to.
const URL_ATTRS: ReadonlySet<string> = new Set(["href", "src", "poster", "data", "action", "formaction", "background", "xlink:href"]);
const SRCSET_ATTRS: ReadonlySet<string> = new Set(["srcset", "imagesrcset"]);

interface Ref {
  readonly url: string;
  readonly fetched: boolean;
}

function attrRefs(page: string): Ref[] {
  const refs: Ref[] = [];
  for (const tag of page.matchAll(TAG)) {
    const name = String(tag[1]).toLowerCase();
    for (const a of String(tag[2]).matchAll(ATTR)) {
      const attr = String(a[1]).toLowerCase();
      const value = a[2] ?? a[3] ?? String(a[4]);
      if (attr === "style") refs.push(...cssRefs(value));
      else if (SRCSET_ATTRS.has(attr)) for (const c of value.split(",")) refs.push({ url: String(c.trim().split(/\s+/)[0]), fetched: true });
      else if (URL_ATTRS.has(attr)) refs.push({ url: value.trim(), fetched: !(name === "a" && attr === "href") });
      else {
        const inside = REMOTE_INSIDE.exec(value);
        if (inside !== null) refs.push({ url: inside[0], fetched: true });
      }
    }
  }
  for (const m of page.matchAll(STYLE_ELEMENT)) refs.push(...cssRefs(String(m[1])));
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
      if (url.startsWith("/")) {
        found.push(`${path}: "${url}" is root-absolute; use a relative path`);
        continue;
      }
      const target = resolve(path, String(url.split(/[?#]/)[0]));
      if (target === undefined) found.push(`${path}: "${url}" leaves the site`);
      else if (!outputs.has(target)) found.push(`${path}: "${url}" is not a built file`);
    }
  }
  return found;
}
