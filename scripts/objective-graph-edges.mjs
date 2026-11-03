// Regenerates the edge list in docs/designs/objective-graph-v1.edges.json from the module that ships.
// The design document is a narrative; the edges are data, and data that is copied by hand rots. Run this
// after changing OBJECTIVE_EDGES: `node scripts/objective-graph-edges.mjs`.
import {readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {OBJECTIVE_EDGES} from "../packages/agent/dist/objective-graph.js";

const repo=resolve(new URL("..",import.meta.url).pathname);
const path=join(repo,"docs/designs/objective-graph-v1.edges.json");
const design=JSON.parse(await readFile(path,"utf8"));

const edges=OBJECTIVE_EDGES.map(edge=>({
  from:edge.from,
  to:edge.to,
  relation:edge.relation,
  status:edge.relation==="requires"?"verified":"story",
  evidence:edge.evidence,
}));

design.authority="packages/agent/src/objective-graph.ts is authoritative; the `edges` array below is generated from it by scripts/objective-graph-edges.mjs, so the file cannot drift from the module it describes. `dropped` and `open` are design history and are kept by hand.";
design.edges=edges;

await writeFile(path,`${JSON.stringify(design,null,2)}\n`);
console.log(`wrote ${path}: ${String(edges.length)} edges (${String(edges.filter(e=>e.relation==="requires").length)} requires, ${String(edges.filter(e=>e.relation==="expects").length)} expects)`);
