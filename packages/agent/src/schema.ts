import { renderEventsJsonSchema } from "./events.js";

export function writeSchema(write: (text: string) => void): void {
  write(renderEventsJsonSchema());
}

if (import.meta.main) {
  writeSchema((text) => process.stdout.write(text));
}
