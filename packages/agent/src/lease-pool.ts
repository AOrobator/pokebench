// A gameplay lease guards one compute pool: the model endpoint a run talks to.
// Runs on different endpoints (the Mac's llama.cpp, each GPU lane) never wait on each other.
export const LEGACY_LEASE = ".naming-gameplay.lock";

export function leasePool(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new RangeError(`not an http(s) model endpoint: ${baseUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new RangeError(`not an http(s) model endpoint: ${baseUrl}`);
  const port = url.port === "" ? (url.protocol === "https:" ? "443" : "80") : url.port;
  return `${url.hostname.toLowerCase()}:${port}`;
}

export function leaseName(pool: string): string {
  return `.naming-gameplay.${pool.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}.lock`;
}
