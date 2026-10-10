import type { Logger } from "./log.js";

export interface Loop {
  stop(): Promise<void>;
}

/**
 * Run `task` every `intervalMs`, never overlapping. Errors are logged and the loop keeps going,
 * so one flaky RPC call never takes a module down.
 */
export function startLoop(name: string, intervalMs: number, task: () => Promise<void>, log: Logger): Loop {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = async () => {
    if (stopped) return;
    try {
      await task();
    } catch (err) {
      log.error({ err, loop: name }, "loop iteration failed");
    }
    if (!stopped) timer = setTimeout(() => (running = tick()), intervalMs);
  };

  running = tick();
  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
