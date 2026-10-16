// The runner and the operator stop a trial with SIGTERM or SIGINT; either one ends the run as an
// operator abort with its run_end recorded, never as a process that died without one.
export interface SignalSource {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

type OperatorSignal = "SIGINT" | "SIGTERM";

export interface OperatorSignalLatch {
  // Called at once if a signal already arrived (during startup), otherwise on the first signal.
  onAbort(abort: (signal: OperatorSignal) => void): void;
  close(): void;
}

// Armed before the run starts, so a stop during startup still ends the run through its normal
// abort and cleanup. Detached on the first signal, so a second one takes the default path.
export function operatorSignalLatch(source: SignalSource): OperatorSignalLatch {
  let received: OperatorSignal | null = null;
  let subscriber: ((signal: OperatorSignal) => void) | null = null;
  const handlers = (["SIGINT", "SIGTERM"] as const).map((signal) => [signal, (): void => {
    close();
    received = signal;
    subscriber?.(signal);
  }] as const);
  function close(): void {
    for (const [signal, handler] of handlers) source.off(signal, handler);
  }
  for (const [signal, handler] of handlers) source.on(signal, handler);
  return {
    onAbort: (abort) => {
      subscriber = abort;
      if (received !== null) abort(received);
    },
    close,
  };
}
