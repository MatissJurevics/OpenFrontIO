import { Colord } from "colord";
import { html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import type { EventBus } from "../../../core/EventBus";
import { GameMode, UnitType, type Team } from "../../../core/game/Game";
import { OIL_LAYER_ID, oilFieldOutput } from "../../../core/game/OilFields";
import { UserSettings } from "../../../core/game/UserSettings";
import type { Controller } from "../../Controller";
import {
  MouseDownEvent,
  MouseMoveEvent,
  ToggleStructureEvent,
} from "../../InputHandler";
import { isLayerVisible } from "../../MapLayerSettings";
import { Platform } from "../../Platform";
import { themeProvider } from "../../theme/ThemeProvider";
import type { TransformHandler } from "../../TransformHandler";
import { getTranslatedPlayerTeamLabel, translateText } from "../../Utils";
import type { GameView } from "../../view";
import { ImmunityBarVisibleEvent } from "./ImmunityTimer";
import "./PlayerStats";
import type { PlayerStats } from "./PlayerStats";
import { SpawnBarVisibleEvent } from "./SpawnTimer";
import "./TeamStats";
import type { TeamStats } from "./TeamStats";
const playerStatsRegularIcon = assetUrl(
  "images/LeaderboardIconRegularWhite.svg",
);
const playerStatsSolidIcon = assetUrl("images/LeaderboardIconSolidWhite.svg");
const teamStatsRegularIcon = assetUrl("images/TeamIconRegularWhite.svg");
const teamStatsSolidIcon = assetUrl("images/TeamIconSolidWhite.svg");

@customElement("game-left-sidebar")
export class GameLeftSidebar extends LitElement implements Controller {
  @state()
  private isPlayerStatsShown = false;
  @state()
  private isTeamStatsShown = false;
  @state()
  private isVisible = false;
  @state()
  private isPlayerTeamLabelVisible = false;
  @state()
  private playerTeam: Team | null = null;
  @state()
  private spawnBarVisible = false;
  @state()
  private immunityBarVisible = false;

  public transformHandler: TransformHandler;
  public onOilVisibilityChange: (visible: boolean) => void;
  @state() private oilTile: number | null = null;
  private oilSettings = new UserSettings();

  private playerColor: Colord = new Colord("#FFFFFF");
  @property({ attribute: false }) public game: GameView | null = null;
  @property({ attribute: false }) public eventBus: EventBus | null = null;
  @query("player-stats") private playerStats?: PlayerStats;
  @query("team-stats") private teamStats?: TeamStats;
  private showPlayerStatsAfterSpawn = false;

  createRenderRoot() {
    return this;
  }

  init() {
    this.isVisible = true;
    const inspectOil = (e: MouseMoveEvent | MouseDownEvent) => {
      const cell = this.transformHandler.screenToWorldCoordinates(e.x, e.y);
      this.oilTile = this.game?.isValidCoord(cell.x, cell.y)
        ? this.game.ref(cell.x, cell.y)
        : null;
    };
    this.eventBus?.on(MouseMoveEvent, inspectOil);
    this.eventBus?.on(MouseDownEvent, inspectOil);
    this.eventBus?.on(ToggleStructureEvent, (e) => {
      if (e.structureTypes?.includes(UnitType.OilRig)) this.setOilVisible(true);
    });
    this.eventBus?.on(SpawnBarVisibleEvent, (e) => {
      this.spawnBarVisible = e.visible;
    });
    this.eventBus?.on(ImmunityBarVisibleEvent, (e) => {
      this.immunityBarVisible = e.visible;
    });
    if (this.isTeamGame) {
      this.isPlayerTeamLabelVisible = true;
    }
    // Make it visible by default on large screens
    if (Platform.isDesktopWidth) {
      this.showPlayerStatsAfterSpawn = true;
    }
  }

  getTickIntervalMs() {
    return 1000;
  }

  tick() {
    if (this.game === null) return;

    const team = this.game.myPlayer()?.team();
    if (this.playerTeam === null && team !== null && team !== undefined) {
      this.playerTeam = team;
      this.playerColor = themeProvider.current().teamColor(team);
    }

    if (this.showPlayerStatsAfterSpawn && !this.game.inSpawnPhase()) {
      this.showPlayerStatsAfterSpawn = false;
      this.isPlayerStatsShown = true;
    }

    if (!this.game.inSpawnPhase() && this.isPlayerTeamLabelVisible) {
      this.isPlayerTeamLabelVisible = false;
    }

    this.requestUpdate();
    this.playerStats?.refresh();
    this.teamStats?.refresh();
  }

  private get barOffset(): number {
    return (this.spawnBarVisible ? 7 : 0) + (this.immunityBarVisible ? 7 : 0);
  }

  private togglePlayerStats(): void {
    this.isPlayerStatsShown = !this.isPlayerStatsShown;
  }

  private toggleTeamStats(): void {
    this.isTeamStatsShown = !this.isTeamStatsShown;
  }

  private get isTeamGame(): boolean {
    return this.game?.config().gameConfig().gameMode === GameMode.Team;
  }

  private setOilVisible(visible: boolean) {
    const overrides = this.oilSettings.graphicsOverrides();
    if (isLayerVisible(overrides, OIL_LAYER_ID) === visible) return;
    this.oilSettings.setGraphicsOverrides({
      ...overrides,
      mapLayerVisibility: {
        ...overrides.mapLayerVisibility,
        [OIL_LAYER_ID]: visible,
      },
    });
    this.onOilVisibilityChange?.(visible);
    this.requestUpdate();
  }

  private renderOilInfo() {
    const visible = isLayerVisible(
      this.oilSettings.graphicsOverrides(),
      OIL_LAYER_ID,
    );
    const field =
      this.oilTile === null
        ? undefined
        : this.game?.oilFields().fieldAt(this.oilTile);
    const rigs = field
      ? this.game!.units(UnitType.OilRig).filter(
          (u) =>
            u.isActive() &&
            !u.isUnderConstruction() &&
            this.game!.isLand(u.tile()) &&
            this.game!.oilFields().fieldAt(u.tile())?.id === field.id,
        )
      : [];
    const mine = rigs.filter((u) => u.owner() === this.game?.myPlayer()).length;
    const income =
      field && rigs.length
        ? Math.floor(
            (oilFieldOutput(field.capacity, rigs.length) * mine) / rigs.length,
          )
        : 0;
    return html`<section class="mt-2 text-xs text-slate-200 max-w-[260px]">
      <button
        class="rounded border border-amber-500/60 px-2 py-1 text-amber-300 hover:bg-amber-500/20"
        aria-pressed=${visible}
        @click=${() => this.setOilVisible(!visible)}
      >
        ${translateText("oil.overlay")} ${visible ? "●" : "○"}
      </button>
      ${visible
        ? html`<div class="mt-2 space-y-1" aria-live="polite">
            <div
              class="h-1 rounded bg-linear-to-r from-amber-800 to-yellow-300"
            ></div>
            ${field
              ? html`
                  <strong class="text-amber-300"
                    >${translateText("oil.field", { id: field.id })}</strong
                  >
                  <div>
                    ${translateText("oil.capacity", {
                      capacity: field.capacity,
                      tiles: field.tiles,
                    })}
                  </div>
                  <div>
                    ${translateText("oil.rigs", { total: rigs.length, mine })}
                  </div>
                  <div>${translateText("oil.income", { income })}</div>
                  <div class="text-slate-400">
                    ${translateText(
                      rigs.length >= field.capacity
                        ? "oil.saturated"
                        : "oil.available",
                    )}
                  </div>
                `
              : html`<div>
                  ${translateText(
                    this.oilTile === null ? "oil.hint" : "oil.none",
                  )}
                </div>`}
            <div class="text-[10px] text-slate-400">
              ${translateText("oil.renewable")}
            </div>
          </div>`
        : null}
    </section>`;
  }

  render() {
    return html`
      <aside
        class=${`fixed top-0 left-0 z-900 flex flex-col max-h-[calc(100vh-80px)] overflow-y-auto p-2 bg-gray-800/92 backdrop-blur-sm shadow-xs rounded-br-lg ${this.isPlayerStatsShown || this.isTeamStatsShown ? "max-[400px]:w-full max-[400px]:rounded-none" : ""} transition-all duration-300 ease-out transform ${
          this.isVisible ? "translate-x-0" : "hidden"
        }`}
        style="margin-top: ${this.barOffset}px;"
      >
        <div class="flex items-center gap-4 xl:gap-6 text-white">
          <div
            class="cursor-pointer p-0.5 bg-gray-700/50 hover:bg-gray-600 border rounded-md border-slate-500 transition-colors"
            @click=${this.togglePlayerStats}
            role="button"
            tabindex="0"
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " " || e.code === "Space") {
                e.preventDefault();
                this.togglePlayerStats();
              }
            }}
          >
            <img
              src=${this.isPlayerStatsShown
                ? playerStatsSolidIcon
                : playerStatsRegularIcon}
              alt=${translateText("help_modal.icon_alt_player_leaderboard") ||
              "Player Leaderboard Icon"}
              width="20"
              height="20"
            />
          </div>
          ${this.isTeamGame
            ? html`
                <div
                  class="cursor-pointer p-0.5 bg-gray-700/50 hover:bg-gray-600 border rounded-md border-slate-500 transition-colors"
                  @click=${this.toggleTeamStats}
                  role="button"
                  tabindex="0"
                  @keydown=${(e: KeyboardEvent) => {
                    if (
                      e.key === "Enter" ||
                      e.key === " " ||
                      e.code === "Space"
                    ) {
                      e.preventDefault();
                      this.toggleTeamStats();
                    }
                  }}
                >
                  <img
                    src=${this.isTeamStatsShown
                      ? teamStatsSolidIcon
                      : teamStatsRegularIcon}
                    alt=${translateText(
                      "help_modal.icon_alt_team_leaderboard",
                    ) || "Team Leaderboard Icon"}
                    width="20"
                    height="20"
                  />
                </div>
              `
            : null}
          ${this.isPlayerStatsShown || this.isTeamStatsShown
            ? html`<span
                class="ml-auto text-[10px] text-slate-500 select-all leading-none self-start"
                title=${translateText("help_modal.game_id_tooltip")}
                >${this.game?.gameID() ?? ""}</span
              >`
            : null}
        </div>
        ${this.isPlayerTeamLabelVisible
          ? html`
              <div
                class="flex items-center w-full text-white mt-2"
                @contextmenu=${(e: Event) => e.preventDefault()}
              >
                ${translateText("help_modal.ui_your_team")}
                <span
                  style="--color: ${this.playerColor.toRgbString()}"
                  class="text-(--color)"
                >
                  &nbsp;${getTranslatedPlayerTeamLabel(
                    this.playerTeam,
                    this.game?.teamClanTag(this.playerTeam),
                  )}
                  &#10687;
                </span>
              </div>
            `
          : null}
        ${this.renderOilInfo()}
        <div class="flex flex-col gap-2 min-w-0 w-full">
          <player-stats
            class=${this.isPlayerStatsShown ? "block min-w-0" : "hidden"}
            .game=${this.game}
            .eventBus=${this.eventBus}
            .visible=${this.isPlayerStatsShown}
          ></player-stats>
          <team-stats
            class=${this.isTeamStatsShown && this.isTeamGame
              ? "block min-w-0"
              : "hidden"}
            .game=${this.game}
            .visible=${this.isTeamStatsShown && this.isTeamGame}
          ></team-stats>
        </div>
        <slot></slot>
      </aside>
    `;
  }
}
