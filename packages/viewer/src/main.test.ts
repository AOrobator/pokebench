// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

const boot = vi.fn().mockRejectedValue(new Error("no server"));
vi.mock("./app.js", () => ({ boot }));

it("boots the app on the page's window and reports a failed start on the page", async () => {
  document.body.innerHTML = '<div data-ui="problems" hidden></div>';
  await import("./main.js");
  expect(boot).toHaveBeenCalledWith(window);
  await vi.waitFor(() => {
    expect(document.querySelector('[data-ui="problems"]')?.textContent).toBe("viewer failed to start: Error: no server");
  });
  expect((document.querySelector('[data-ui="problems"]') as HTMLElement).hidden).toBe(false);
});
