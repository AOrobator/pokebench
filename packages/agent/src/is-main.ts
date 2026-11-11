// import.meta.main is undefined before Node 24.2, which would make every entrypoint exit 0 without
// running. Refuse that Node loudly instead.
export function isMain(meta: { readonly main?: boolean }, nodeVersion: string = process.versions.node): boolean {
  if (typeof meta.main !== "boolean") {
    throw new Error(
      `Node ${nodeVersion} cannot tell which module it started (import.meta.main arrived in Node 24.2). PokeBench needs Node 26 or newer.`,
    );
  }
  return meta.main;
}
