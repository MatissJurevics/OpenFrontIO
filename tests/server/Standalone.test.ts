import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEnv } from "../../src/core/configuration/Config";
import { checkinBody } from "../../src/server/ClusterCheckin";
import { ServerEnv } from "../../src/server/ServerEnv";
import { verifyClientToken } from "../../src/server/jwt";

const guest = "44a9e832-b1f0-4f23-badc-557abbccc345";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("standalone guest server", () => {
  it("requires explicit opt-in", () => {
    vi.stubEnv("STANDALONE", "false");
    expect(ServerEnv.standalone()).toBe(false);
    vi.stubEnv("STANDALONE", "true");
    expect(ServerEnv.standalone()).toBe(true);
  });
  it("accepts private guest bearer IDs without account claims", async () => {
    vi.stubEnv("STANDALONE", "true");
    vi.spyOn(ServerEnv, "env").mockReturnValue(GameEnv.Prod);
    await expect(verifyClientToken(guest)).resolves.toEqual({
      type: "success",
      persistentId: guest,
      claims: null,
    });
  });
  it("rejects guest IDs on normal production servers", async () => {
    vi.stubEnv("STANDALONE", "false");
    vi.spyOn(ServerEnv, "env").mockReturnValue(GameEnv.Prod);
    expect((await verifyClientToken(guest)).type).toBe("error");
  });
  it("does not register this fork in an external server fleet", () => {
    vi.stubEnv("STANDALONE", "true");
    vi.stubEnv("GAME_HOST", "openfront.mati.ss");
    expect(checkinBody(0)).toBeNull();
  });
});
