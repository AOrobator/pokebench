import { esc } from "./html.js";
import { plainText } from "./markdown.js";
import type { Post } from "./posts.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// The nth Sunday (1-based) of a month, as a day of the month.
function sunday(year: number, month: number, nth: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + 7 * (nth - 1);
}

// A post's pubDate is noon in New York on its date. US daylight time runs from the second Sunday of
// March to the first Sunday of November (both switch at 2 AM, so noon on either day is already switched).
export function rfc822(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const year = Number(y);
  const month = Number(m) - 1;
  const day = Number(d);
  const t = Date.UTC(year, month, day);
  const dst = t >= Date.UTC(year, 2, sunday(year, 2, 2)) && t < Date.UTC(year, 10, sunday(year, 10, 1));
  const dd = String(day).padStart(2, "0");
  return `${String(DAYS[new Date(t).getUTCDay()])}, ${dd} ${String(MONTHS[month])} ${String(year)} 12:00:00 ${dst ? "-0400" : "-0500"}`;
}

export function postPath(p: Post): string {
  return `updates/${p.name}.html`;
}

// RSS 2.0. Links are absolute from the site's base URL; nothing here is fetched by the site itself.
export function feed(baseUrl: string, posts: readonly Post[]): string {
  const items = posts.map((p) => {
    const url = esc(baseUrl + postPath(p));
    return `<item>
<title>${esc(p.title)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<pubDate>${rfc822(p.date)}</pubDate>
<description>${esc(plainText(p.first))}</description>
</item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>PokéBench updates</title>
<link>${esc(`${baseUrl}updates.html`)}</link>
<description>New models, harness versions and released runs on PokéBench.</description>
<language>en</language>
${items.join("\n")}
</channel>
</rss>
`;
}
