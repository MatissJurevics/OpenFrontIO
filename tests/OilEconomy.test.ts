import { beforeEach, describe, expect, test } from "vitest";
import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
import { OilEconomyExecution } from "../src/core/execution/OilEconomyExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { createGame } from "../src/core/game/GameImpl";
import { GameMapImpl } from "../src/core/game/GameMap";
import { OIL_GOLD_PER_RIG, OilField } from "../src/core/game/OilFields";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

let game: Game, a: Player, b: Player, field: OilField, tiles: number[];
let economy: OilEconomyExecution;

beforeEach(async () => {
  game = await setup("plains", { instantBuild: true });
  a = game.addPlayer(new PlayerInfo("A", PlayerType.Human, null, "a"));
  b = game.addPlayer(new PlayerInfo("B", PlayerType.Human, null, "b"));
  a.addGold(100_000_000n);
  b.addGold(100_000_000n);
  field = game.oilFields().fields[0];
  expect(field).toBeDefined();
  tiles = Array.from(game.oilFields().fieldIds.keys()).filter(
    (t) => game.oilFields().fieldIds[t] === field.id,
  );
  economy = new OilEconomyExecution();
  economy.init(game);
});

function rig(player: Player, index: number) {
  player.conquer(tiles[index]);
  return player.buildUnit(UnitType.OilRig, tiles[index], {});
}
function gain(tick = 10) {
  const beforeA = a.gold(),
    beforeB = b.gold();
  economy.tick(tick);
  return [a.gold() - beforeA, b.gold() - beforeB];
}

describe("shared oil production", () => {
  test("one completed rig earns gold only on payout ticks", () => {
    rig(a, 0);
    expect(gain(9)).toEqual([0n, 0n]);
    expect(gain()).toEqual([BigInt(OIL_GOLD_PER_RIG), 0n]);
  });

  test("overcapacity is capped and rival owners split by rig count", () => {
    const count = (field.capacity + 1) * 3;
    for (let i = 0; i < count; i++) rig(i % 3 < 2 ? a : b, i);
    const [goldA, goldB] = gain();
    const cap = BigInt(field.capacity * OIL_GOLD_PER_RIG);
    expect(goldA + goldB).toBe(cap);
    expect(Math.abs(Number(goldA) - (Number(cap) * 2) / 3)).toBeLessThanOrEqual(
      count,
    );
    // Rounding is fair over a complete rotation, never creates extra gold.
    let totalA = 0n,
      totalB = 0n;
    for (let i = 1; i <= count; i++) {
      const [x, y] = gain(i * 10);
      totalA += x;
      totalB += y;
    }
    expect(totalA).toBe(totalB * 2n);
    expect(totalA + totalB).toBe(cap * BigInt(count));
  });

  test("unfinished, destroyed and submerged rigs do not produce", () => {
    const building = rig(a, 0);
    building.setUnderConstruction(true);
    const destroyed = rig(a, 1);
    destroyed.delete(false);
    const submerged = rig(a, 2);
    game.map().setWater(submerged.tile());
    expect(gain()).toEqual([0n, 0n]);
    building.setUnderConstruction(false);
    expect(gain()).toEqual([1000n, 0n]);
  });

  test("capturing a rig transfers its production to the new owner", () => {
    const unit = rig(a, 0);
    b.captureUnit(unit);
    expect(gain()).toEqual([0n, 1000n]);
  });

  test("underused fields do not give a lone rig the whole field's capacity", () => {
    rig(a, 0);
    expect(gain()).toEqual([1000n, 0n]);
  });

  test("separate fields have independent production caps", () => {
    const map = new GameMapImpl(
      256,
      256,
      new Uint8Array(256 * 256).fill(128),
      256 * 256,
    );
    game = createGame([], [], map, map, game.config());
    game.endSpawnPhase();
    a = game.addPlayer(new PlayerInfo("A", PlayerType.Human, null, "a"));
    b = game.addPlayer(new PlayerInfo("B", PlayerType.Human, null, "b"));
    a.addGold(100_000_000n);
    b.addGold(100_000_000n);
    field = game.oilFields().fields[0];
    tiles = Array.from(game.oilFields().fieldIds.keys()).filter(
      (t) => game.oilFields().fieldIds[t] === field.id,
    );
    economy.init(game);
    expect(game.oilFields().fields.length).toBeGreaterThan(1);
    rig(a, 0);
    const second = game.oilFields().fields[1];
    const tile = game.oilFields().fieldIds.findIndex((id) => id === second.id);
    b.conquer(tile);
    b.buildUnit(UnitType.OilRig, tile, {});
    expect(gain()).toEqual([1000n, 1000n]);
  });
});

describe("rig construction", () => {
  test("validates land deposits, ownership, cost and structure spacing", () => {
    const tile = tiles[0];
    expect(a.canBuild(UnitType.OilRig, tile)).toBe(false);
    a.conquer(tile);
    expect(a.canBuild(UnitType.OilRig, tile)).toBe(tile);
    const bare = game.oilFields().fieldIds.findIndex((id) => id === 0);
    a.conquer(bare);
    expect(a.canBuild(UnitType.OilRig, bare)).toBe(false);
    expect(a.canBuild(UnitType.OilRig, -1)).toBe(false);
    const before = a.gold();
    game.addExecution(new ConstructionExecution(a, UnitType.OilRig, tile));
    executeTicks(game, 4);
    expect(a.units(UnitType.OilRig)).toHaveLength(1);
    expect(a.units(UnitType.OilRig)[0].isUnderConstruction()).toBe(false);
    expect(before - a.gold()).toBe(125_000n);
    expect(a.canBuild(UnitType.OilRig, tile)).toBe(false);
    b.conquer(tiles[tiles.length - 1]);
    b.removeGold(b.gold());
    expect(b.canBuild(UnitType.OilRig, tiles[tiles.length - 1])).toBe(false);
  });

  test("water deposits cannot be used even if they were land at game creation", () => {
    const tile = tiles[0];
    a.conquer(tile);
    game.map().setWater(tile);
    expect(a.canBuild(UnitType.OilRig, tile)).toBe(false);
  });
});

test("a rig captured during construction starts paying its captor only after completion", async () => {
  const g = await setup("plains", { instantBuild: false });
  const owner = g.addPlayer(
    new PlayerInfo("Owner", PlayerType.Human, null, "owner"),
  );
  const captor = g.addPlayer(
    new PlayerInfo("Captor", PlayerType.Human, null, "captor"),
  );
  owner.addGold(1_000_000n);
  const tile = g.oilFields().fieldIds.findIndex((id) => id !== 0);
  owner.conquer(tile);
  g.addExecution(new ConstructionExecution(owner, UnitType.OilRig, tile));
  executeTicks(g, 2);
  const rig = owner.units(UnitType.OilRig)[0];
  expect(rig.isUnderConstruction()).toBe(true);
  captor.captureUnit(rig);
  const production = new OilEconomyExecution();
  production.init(g);
  const before = captor.gold();
  production.tick(10);
  expect(captor.gold()).toBe(before);
  executeTicks(g, 60);
  expect(rig.isUnderConstruction()).toBe(false);
  production.tick(80);
  expect(captor.gold() - before).toBe(1000n);
});

test("disabled rigs are rejected by the same construction path as other units", async () => {
  const g = await setup("plains", {
    disabledUnits: [UnitType.OilRig],
    instantBuild: true,
  });
  const player = g.addPlayer(
    new PlayerInfo("Owner", PlayerType.Human, null, "owner"),
  );
  player.addGold(1_000_000n);
  const tile = g.oilFields().fieldIds.findIndex((id) => id !== 0);
  player.conquer(tile);
  expect(player.canBuild(UnitType.OilRig, tile)).toBe(false);
  g.addExecution(new ConstructionExecution(player, UnitType.OilRig, tile));
  executeTicks(g, 4);
  expect(player.units(UnitType.OilRig)).toHaveLength(0);
});

test("independent simulations replay the same construction and capture stream identically", async () => {
  async function replay() {
    const g = await setup("plains", { instantBuild: false });
    const owner = g.addPlayer(
      new PlayerInfo("A", PlayerType.Human, "client-a", "a"),
    );
    const captor = g.addPlayer(
      new PlayerInfo("B", PlayerType.Human, "client-b", "b"),
    );
    owner.addGold(1_000_000n);
    const tile = g.oilFields().fieldIds.findIndex((id) => id !== 0);
    owner.conquer(tile);
    g.addExecution(new OilEconomyExecution());
    g.addExecution(new ConstructionExecution(owner, UnitType.OilRig, tile));
    const balances: bigint[][] = [];
    for (let tick = 0; tick < 150; tick++) {
      if (tick === 100) captor.captureUnit(owner.units(UnitType.OilRig)[0]);
      g.executeNextTick();
      balances.push([owner.gold(), captor.gold()]);
    }
    expect(g.stats().stats()["client-a"]?.gold?.[6]).toBeGreaterThan(0n);
    expect(g.stats().stats()["client-b"]?.gold?.[6]).toBeGreaterThan(0n);
    return { balances, fields: g.oilFields().fields, stats: g.stats().stats() };
  }
  expect(await replay()).toEqual(await replay());
});
