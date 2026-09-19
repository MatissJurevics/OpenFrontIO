import { Execution, Game, Unit, UnitType } from "../game/Game";
import { OIL_TICKS_PER_PAYOUT, oilFieldOutput } from "../game/OilFields";

/** One economy pass per second, independent of rig execution/insertion order. */
export class OilEconomyExecution implements Execution {
  private game: Game;
  init(game: Game): void {
    this.game = game;
  }
  tick(ticks: number): void {
    if (ticks % OIL_TICKS_PER_PAYOUT !== 0) return;
    const fields = this.game.oilFields();
    const groups = new Map<number, Unit[]>();
    for (const rig of this.game.units(UnitType.OilRig)) {
      if (
        !rig.isActive() ||
        rig.isUnderConstruction() ||
        !this.game.isLand(rig.tile())
      )
        continue;
      const field = fields.fieldAt(rig.tile());
      if (!field) continue;
      const rigs = groups.get(field.id) ?? [];
      rigs.push(rig);
      groups.set(field.id, rigs);
    }
    for (const [id, rigs] of groups) {
      rigs.sort((a, b) => a.id() - b.id());
      const total = oilFieldOutput(fields.fields[id - 1].capacity, rigs.length);
      const each = Math.floor(total / rigs.length);
      const remainder = total % rigs.length;
      // Rotate rounding pennies so long-lived low-ID rigs have no advantage.
      const offset = Math.floor(ticks / OIL_TICKS_PER_PAYOUT) % rigs.length;
      for (let i = 0; i < rigs.length; i++) {
        const extra =
          (i - offset + rigs.length) % rigs.length < remainder ? 1 : 0;
        const owner = rigs[i].owner();
        const gold = BigInt(each + extra);
        owner.addGold(gold);
        this.game.stats().goldOil(owner, gold);
      }
    }
  }
  isActive(): boolean {
    return true;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
