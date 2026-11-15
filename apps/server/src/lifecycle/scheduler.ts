export interface IScheduler {
  after: (ms: number, run: () => void) => () => void;
  every: (ms: number, run: () => void) => () => void;
}

// Unref'd so a pending prune never keeps the process alive.
export const systemScheduler: IScheduler = {
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    timer.unref();

    return () => clearTimeout(timer);
  },
  every: (ms, run) => {
    const timer = setInterval(run, ms);
    timer.unref();

    return () => clearInterval(timer);
  },
};
