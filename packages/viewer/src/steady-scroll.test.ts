// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BROWSER_MODULES } from "./browser-modules.js";
import { readPlace, returnToPlace } from "./steady-scroll.js";

// happy-dom has no layout, so each row states where it sits. The pane's scrollTop moves them all, as a browser would.
function pane(rows: readonly (readonly [string, number])[], height = 50): HTMLElement {
  const box = document.createElement("div");
  box.getBoundingClientRect = () => ({ top: 100, bottom: 400 }) as DOMRect;
  document.body.replaceChildren(box);
  draw(box, rows, height);
  return box;
}
function draw(box: HTMLElement, rows: readonly (readonly [string, number])[], height = 50): void {
  box.replaceChildren(...rows.map(([key, top]) => {
    const row = document.createElement("button");
    row.dataset.keep = key; row.dataset.focus = key;
    row.getBoundingClientRect = () => ({ top: top - box.scrollTop, bottom: top - box.scrollTop + height, height }) as DOMRect;
    return row;
  }));
}

describe("steady scroll", () => {
  it("is served to the browser", () => {
    expect(BROWSER_MODULES).toContain("steady-scroll");
  });

  it("keeps the row being read in place when rows arrive above it", () => {
    const box = pane([["a", 100], ["b", 150], ["c", 200], ["d", 250]]);
    box.scrollTop = 110;
    const place = readPlace(box, null);
    draw(box, [["new", 100], ["a", 160], ["b", 210], ["c", 260], ["d", 310]]);
    returnToPlace(box, place);
    expect(box.scrollTop).toBe(170);
  });

  it("leaves scrollTop alone when nothing moved, so a touch scroll keeps its momentum", () => {
    const box = pane([["a", 100], ["b", 150]]);
    box.scrollTop = 60;
    let writes = 0, top = 60;
    Object.defineProperty(box, "scrollTop", { get: () => top, set: (value: number) => { writes += 1; top = value; } });
    const place = readPlace(box, null);
    draw(box, [["a", 100], ["b", 150]]);
    returnToPlace(box, place);
    expect(writes).toBe(0);
  });

  it("anchors on the innermost keyed row, not a box around it", () => {
    const box = pane([["a", 100]]);
    const outer = box.querySelector<HTMLElement>("[data-keep]");
    if (outer === null) throw new Error("no row");
    const inner = document.createElement("span");
    inner.dataset.keep = "inner";
    inner.getBoundingClientRect = () => ({ top: 120, bottom: 140, height: 20 }) as DOMRect;
    outer.append(inner);
    expect(readPlace(box, null).key).toBe("inner");
  });

  it("skips rows scrolled above the pane and rows with no size", () => {
    const box = pane([["gone", 0], ["next", 120]]);
    expect(readPlace(box, null).key).toBe("next");
    const hidden = pane([["hidden", 150]], 0);
    expect(readPlace(hidden, null).key).toBeNull();
  });

  it("measures from the top of the screen when the page has scrolled past the pane's top", () => {
    const box = pane([["above", 20], ["seen", 70]]);
    box.getBoundingClientRect = () => ({ top: -200, bottom: 300 }) as DOMRect;
    expect(readPlace(box, null).key).toBe("above");
    draw(box, [["above", -60], ["seen", 70]]);
    expect(readPlace(box, null).key).toBe("seen");
  });

  it("stays put when the row being read is gone", () => {
    const box = pane([["a", 100], ["b", 150]]);
    box.scrollTop = 20;
    const place = readPlace(box, null);
    draw(box, [["z", 100]]);
    returnToPlace(box, place);
    expect(box.scrollTop).toBe(20);
  });

  it("puts focus back on the redrawn control without scrolling to it", () => {
    const box = pane([["a", 100], ["b", 150]]);
    const before = box.querySelector<HTMLElement>('[data-focus="b"]');
    const place = readPlace(box, before);
    draw(box, [["a", 100], ["b", 150]]);
    const after = box.querySelector<HTMLElement>('[data-focus="b"]');
    if (after === null) throw new Error("no control");
    let options: FocusOptions | undefined;
    after.focus = (value?: FocusOptions) => { options = value; };
    returnToPlace(box, place);
    expect(options).toEqual({ preventScroll: true });
  });

  it("ignores focus outside the pane", () => {
    const box = pane([["a", 100]]);
    const outside = document.createElement("button");
    outside.dataset.focus = "a";
    document.body.append(outside);
    expect(readPlace(box, outside).focus).toBeNull();
  });
});
