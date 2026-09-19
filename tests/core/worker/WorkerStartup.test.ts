import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  post: vi.fn(),
  listener: null as unknown as (e: { data: unknown }) => Promise<void>,
}));
vi.mock("../../../src/core/GameRunner", () => ({
  createGameRunner: mocks.create,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("__ASSET_MANIFEST__", {});
  vi.stubGlobal("self", {
    postMessage: mocks.post,
    addEventListener: (_type: string, listener: typeof mocks.listener) => {
      if (_type === "message") mocks.listener = listener;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("worker startup protocol", () => {
  it("sends asynchronous map initialization failures back to the page", async () => {
    mocks.create.mockRejectedValueOnce(new Error("map request returned 502"));
    await import("../../../src/core/worker/Worker.worker");
    await mocks.listener({
      data: { type: "init", id: "startup-1", gameStartInfo: {}, cdnBase: "" },
    });
    expect(mocks.post).toHaveBeenCalledWith({
      type: "initialization_error",
      id: "startup-1",
      error: "map request returned 502",
    });
  });
  it("acknowledges successful initialization", async () => {
    mocks.create.mockResolvedValueOnce({});
    await import("../../../src/core/worker/Worker.worker");
    await mocks.listener({
      data: { type: "init", id: "startup-2", gameStartInfo: {}, cdnBase: "" },
    });
    expect(mocks.post).toHaveBeenCalledWith({
      type: "initialized",
      id: "startup-2",
    });
  });
});
