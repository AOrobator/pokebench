import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { jsonHtml, richText } from "./inspect-format.js";

const dom = (html: string) => { const document = new Window().document; document.body.innerHTML = html; return document; };
describe("readable event content", () => {
  it("highlights JSON while preserving its exact pretty-printed text", () => {
    const value = {message: "line one\nline two <script>", count: 2, valid: true, empty: null};
    const page = dom(jsonHtml(value));
    expect(page.body.textContent).toBe(JSON.stringify(value, null, 2));
    expect(page.querySelector(".json-key")?.textContent).toBe('"message"');
    expect(page.querySelector(".json-number")?.textContent).toBe("2");
    expect(page.querySelector("script")).toBeNull();
  });
  it("renders Markdown structure and newlines without hiding full content", () => {
    const page = dom(richText("# Decision\n\n**Observe** the screen.\nThen act.\n\n- one\n- two\n\n> evidence\n\n```json\n{\"ready\":true}\n```"));
    expect(page.querySelector("h3")?.textContent).toBe("Decision");
    expect(page.querySelector("strong")?.textContent).toBe("Observe");
    expect(page.querySelectorAll("li")).toHaveLength(2);
    expect(page.querySelector("blockquote")?.textContent).toBe("evidence");
    expect(page.querySelector("br")).not.toBeNull();
    expect(page.querySelector(".json-key")?.textContent).toBe('"ready"');
  });
  it("escapes HTML and refuses executable link schemes", () => {
    const page = dom(richText('<img src=x onerror=alert(1)> [bad](javascript:alert) [good](https://example.com/?a=1&b=2)'));
    expect(page.querySelector("img")).toBeNull();
    expect(page.querySelectorAll("a")).toHaveLength(1);
    expect(page.querySelector("a")?.getAttribute("href")).toBe("https://example.com/?a=1&b=2");
    expect(page.body.textContent).toContain("<img src=x onerror=alert(1)>");
  });
  it("keeps fenced non-JSON code literal, including Markdown and HTML", () => {
    const page = dom(richText("```text\n**literal** <script>\n```\n\n`<b>` *emphasis*"));
    expect(page.querySelector("pre")?.textContent).toBe("**literal** <script>");
    expect(page.querySelector("script")).toBeNull();
    expect(page.querySelector("em")?.textContent).toBe("emphasis");
  });
  it("formats JSON payloads and preserves invalid JSON as ordinary text", () => {
    expect(dom(richText('{"items":[1,false]}')).querySelector(".json-number")?.textContent).toBe("1");
    expect(dom(richText('{broken')).body.textContent).toBe("{broken");
    expect(dom(richText("   ")).body.textContent).toBe("");
  });
});
