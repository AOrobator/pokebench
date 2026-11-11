import { renderEventsJsonSchema } from "./events.js";
import { isMain } from "./is-main.js";

export function writeSchema(write: (text: string) => void): void {
  write(renderEventsJsonSchema());
}

if (isMain(import.meta)) {
  writeSchema((text) => process.stdout.write(text));
}
