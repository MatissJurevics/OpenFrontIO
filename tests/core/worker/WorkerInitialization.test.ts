import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerClient } from "../../../src/core/worker/WorkerClient";
const state = vi.hoisted(() => ({
  worker: null as unknown as EventTarget & {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  },
}));
vi.mock("../../../src/core/worker/Worker.worker.ts?worker&inline", () => ({
  default: class extends EventTarget {
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      super();
      state.worker = this;
    }
  },
}));
async function start() {
  const client = new WorkerClient({} as never, undefined);
  const promise = client.initialize();
  await vi.waitFor(() => expect(state.worker.postMessage).toHaveBeenCalled());
  const id = state.worker.postMessage.mock.calls[0][0].id;
  return { client, promise, id };
}
beforeEach(() => {
  vi.useFakeTimers();
  state.worker = null!;
});
afterEach(() => vi.useRealTimers());
describe("worker initialization failures", () => {
  it("reports a map-load failure immediately and terminates the failed worker", async () => {
    const { promise, id } = await start();
    const failure = expect(promise).rejects.toThrow("Failed to load map: 502");
    state.worker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "initialization_error",
          id,
          error: "Failed to load map: 502",
        },
      }),
    );
    await failure;
    expect(state.worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reports worker script errors without waiting a minute", async () => {
    const { promise } = await start();
    const failure = expect(promise).rejects.toThrow("script unavailable");
    state.worker.dispatchEvent(
      new ErrorEvent("error", { message: "script unavailable" }),
    );
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears the timeout after successful initialization", async () => {
    const { client, promise, id } = await start();
    state.worker.dispatchEvent(
      new MessageEvent("message", { data: { type: "initialized", id } }),
    );
    await promise;
    expect(vi.getTimerCount()).toBe(0);
    expect(state.worker.terminate).not.toHaveBeenCalled();
    client.cleanup();
  });
  it("terminates a hung worker when the timeout expires", async () => {
    const { promise } = await start();
    const failure = expect(promise).rejects.toThrow(
      "Worker initialization timeout",
    );
    await vi.advanceTimersByTimeAsync(60000);
    await failure;
    expect(state.worker.terminate).toHaveBeenCalledOnce();
  });
  it("cancels pending initialization during cleanup", async () => {
    const { client, promise } = await start();
    const failure = expect(promise).rejects.toThrow("cancelled");
    client.cleanup();
    await failure;
    expect(vi.getTimerCount()).toBe(0);
    expect(state.worker.terminate).toHaveBeenCalledOnce();
  });
});
