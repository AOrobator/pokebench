// The runner and the operator stop a trial with SIGTERM or SIGINT; either one ends the run as an
// operator abort with its run_end recorded, never as a process that died without one.
export interface SignalSource {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

export function onOperatorSignals(source: SignalSource, abort: (signal: "SIGINT" | "SIGTERM") => void): () => void {
  let fired = false;
  const handlers = (["SIGINT", "SIGTERM"] as const).map((signal) => {
    const handler = (): void => {
      if (fired) return;
      fired = true;
      abort(signal);
    };
    source.on(signal, handler);
    return [signal, handler] as const;
  });
  return () => { for (const [signal, handler] of handlers) source.off(signal, handler); };
}
