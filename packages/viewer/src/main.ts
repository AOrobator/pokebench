import { boot, type BootWindow } from "./app.js";
import { watchPhoneFlag } from "./phone.js";

watchPhoneFlag(document);
boot(window as unknown as BootWindow).catch((error: unknown) => {
  const problems = document.querySelector<HTMLElement>('[data-ui="problems"]');
  if (problems !== null) {
    problems.hidden = false;
    problems.textContent = `viewer failed to start: ${String(error)}`;
  }
});
