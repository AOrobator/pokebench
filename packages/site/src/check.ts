// Checks a built site: no page or stylesheet loads anything from the network (INV-3), and every local
// reference names a file the build wrote. Plain <a href> links may point anywhere. It fails closed: any
// attribute value holding a network URL counts as a request unless it is an <a href>.

export type Output = string | Uint8Array;

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const REMOTE_INSIDE = /(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>;,)]+/i;
// Attributes whose value is a URL the browser fetches or navigates to.
const URL_ATTRS: ReadonlySet<string> = new Set(["href", "src", "poster", "data", "action", "formaction", "background", "xlink:href"]);
const SRCSET_ATTRS: ReadonlySet<string> = new Set(["srcset", "imagesrcset"]);

interface Ref {
  readonly url: string;
  readonly fetched: boolean;
}

interface Tag {
  readonly name: string;
  readonly attrs: readonly (readonly [string, string])[];
  readonly end: number;
}

const SPACE = /[\t\n\f\r ]/;

// Reads one start tag the way the HTML tokenizer does (attribute name, optional = value, value
// double-quoted, single-quoted or unquoted up to whitespace or >), so quotes inside an unquoted
// value or > inside a quoted one never hide the attributes after them.
function readTag(page: string, from: number): Tag {
  let i = from + 1;
  let name = "";
  while (i < page.length && /[a-z0-9]/i.test(page.charAt(i))) name += page.charAt(i++);
  const attrs: [string, string][] = [];
  for (;;) {
    while (i < page.length && (SPACE.test(page.charAt(i)) || page.charAt(i) === "/")) i++;
    if (i >= page.length || page.charAt(i) === ">") return { name: name.toLowerCase(), attrs, end: i + 1 };
    let attr = page.charAt(i++);
    while (i < page.length && !SPACE.test(page.charAt(i)) && !"/>=".includes(page.charAt(i))) attr += page.charAt(i++);
    while (i < page.length && SPACE.test(page.charAt(i))) i++;
    let value = "";
    if (page.charAt(i) === "=") {
      i++;
      while (i < page.length && SPACE.test(page.charAt(i))) i++;
      const q = page.charAt(i);
      if (q === '"' || q === "'") {
        const close = page.indexOf(q, i + 1);
        const stop = close < 0 ? page.length : close;
        value = page.slice(i + 1, stop);
        i = stop + 1;
      } else {
        while (i < page.length && !SPACE.test(page.charAt(i)) && page.charAt(i) !== ">") value += page.charAt(i++);
      }
    }
    attrs.push([attr.toLowerCase(), value]);
  }
}

function attrRefs(page: string): Ref[] {
  const refs: Ref[] = [];
  for (let at = page.indexOf("<"); at >= 0; at = page.indexOf("<", at + 1)) {
    if (!/[a-z]/i.test(page.charAt(at + 1))) continue;
    const tag = readTag(page, at);
    for (const [attr, value] of tag.attrs) {
      if (attr === "style") refs.push(...cssRefs(value));
      else if (SRCSET_ATTRS.has(attr)) for (const c of value.split(",")) refs.push({ url: String(c.trim().split(/\s+/)[0]), fetched: true });
      else if (URL_ATTRS.has(attr)) refs.push({ url: value.trim(), fetched: !(tag.name === "a" && attr === "href") });
      else {
        const inside = REMOTE_INSIDE.exec(value);
        if (inside !== null) refs.push({ url: inside[0], fetched: true });
      }
    }
    if (tag.name === "style") {
      const close = page.toLowerCase().indexOf("</style", tag.end);
      refs.push(...cssRefs(page.slice(tag.end, close < 0 ? page.length : close)));
    }
    at = tag.end - 1;
  }
  return refs;
}

function cssRefs(css: string): Ref[] {
  const refs: Ref[] = [];
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]*))\s*\)/gi)) refs.push({ url: m[1] ?? m[2] ?? String(m[3]), fetched: true });
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
