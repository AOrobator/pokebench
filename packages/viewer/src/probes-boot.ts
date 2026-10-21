import { watchPhoneFlag } from "./phone.js";
import { bootProbes } from "./probes-main.js";

watchPhoneFlag(document);
void bootProbes(window);
