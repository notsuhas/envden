import { expect, test, spyOn } from "bun:test";
import { boundedFetch } from "../fetch.ts";

test("notice requests share one deadline and preserve upstream cancellation", async () => {
  const deadline = new AbortController();
  const request = new AbortController();
  let observed: AbortSignal | undefined;
  let calls = 0;

  const fetcher = boundedFetch(async (_input, init) => {
    calls++;
    observed = init?.signal ?? undefined;

    return new Response();
  }, deadline.signal);

  await fetcher("https://server.invalid", { signal: request.signal });
  expect(observed?.aborted).toBe(false);
  request.abort();
  expect(observed?.aborted).toBe(true);
  deadline.abort();

  await Promise.resolve(
    expect(fetcher("https://server.invalid")).rejects.toBe(deadline.signal.reason),
  );

  expect(calls).toBe(1);
});

test("notice deadline stops a fetcher that ignores cancellation", async () => {
  const controller = new AbortController();
  const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);

  try {
    const fetcher = boundedFetch(async () => new Promise(() => {}));
    expect(timeout.mock.calls).toEqual([[2000]]);
    const request = fetcher("https://server.invalid");
    controller.abort(new Error("deadline"));
    await Promise.resolve(expect(request).rejects.toThrow("deadline"));
  } finally {
    timeout.mockRestore();
  }
});
