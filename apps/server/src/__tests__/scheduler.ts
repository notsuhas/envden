import type { IScheduler } from "../lifecycle/scheduler.ts";

interface IJob {
  kind: "after" | "every";
  ms: number;
  run: () => void;
}

// Jobs never fire on their own; a test runs them explicitly.
export function manualScheduler(): IScheduler & { pending: () => IJob[] } {
  const jobs = new Set<IJob>();

  const add = (job: IJob) => {
    jobs.add(job);

    return () => {
      jobs.delete(job);
    };
  };

  return {
    after: (ms, run) => add({ kind: "after", ms, run }),
    every: (ms, run) => add({ kind: "every", ms, run }),
    pending: () => [...jobs],
  };
}
