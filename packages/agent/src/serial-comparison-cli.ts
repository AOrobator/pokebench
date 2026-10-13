import { comparisonCommand } from "./serial-comparison.js";

comparisonCommand(process.argv.slice(2)).then(
  message => { console.log(message); },
  (error:unknown) => { console.error(String(error)); process.exitCode=1; },
);
