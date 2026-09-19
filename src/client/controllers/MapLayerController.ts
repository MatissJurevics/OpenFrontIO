import { getOilFields, OIL_LAYER_ID } from "../../core/game/OilFields";
/**
 * MapLayerController — loads map-layer images (off the critical path) and
 * applies initial visibility from user settings.
 *
 * The renderer tolerates missing layers (warn + skip) until images arrive,
 * so the game starts without blocking on layer PNGs.
 */

import { GameMapSize, GameMapType } from "../../core/game/Game";
import { GameMapLoader } from "../../core/game/GameMapLoader";
import {
  loadLayerImages,
  TerrainMapData,
} from "../../core/game/TerrainMapLoader";
import { UserSettings } from "../../core/game/UserSettings";
import { Controller } from "../Controller";
import { MapRenderer } from "../render/gl";

export class MapLayerController implements Controller {
  constructor(
    private readonly view: MapRenderer,
    private readonly gameMap: TerrainMapData,
    private readonly userSettings: UserSettings,
    private readonly gameMapType: GameMapType,
    private readonly gameMapSize: GameMapSize,
    private readonly mapLoader: GameMapLoader,
    private readonly abortSignal: AbortSignal,
  ) {
    this.gameMap.layers = [
      ...(this.gameMap.layers ?? []).filter(
        (layer) => layer.id !== OIL_LAYER_ID,
      ),
      {
        id: OIL_LAYER_ID,
        placement: "land",
        aboveTerritory: true,
        alpha: 0.65,
      },
    ];
  }

  init() {
    void this.load().catch((e) =>
      console.warn("[MapLayerController] Failed to load map layers:", e),
    );
  }

  private async load() {
    const layers = this.gameMap.layers!;
    const baseLayers = layers.filter((layer) => layer.id !== OIL_LAYER_ID);
    const images = new Map(
      this.gameMap.layerImages ??
        (await loadLayerImages(
          this.gameMapType,
          this.gameMapSize,
          this.mapLoader,
          baseLayers,
        )),
    );
    const map = this.gameMap.gameMap;
    const oil = getOilFields(map);
    const rgba = new Uint8ClampedArray(map.width() * map.height() * 4);
    for (let t = 0; t < oil.richness.length; t++) {
      if (!oil.richness[t]) continue;
      const i = t * 4;
      rgba[i] = 240;
      rgba[i + 1] = 115 + Math.floor(oil.richness[t] * 0.45);
      rgba[i + 2] = 25;
      rgba[i + 3] = 125 + Math.floor(oil.richness[t] * 0.5);
    }
    const oilImage = await createImageBitmap(
      new ImageData(rgba, map.width(), map.height()),
    );
    if (this.abortSignal.aborted) {
      oilImage.close();
      return;
    }
    images.set(OIL_LAYER_ID, oilImage);
    // Retain alongside ordinary layer bitmaps for WebGL context restoration.
    this.gameMap.layerImages = images;
    this.view.setMapLayers(layers, images);
    this.applyVisibility();
    this.applyAlpha();
  }

  private applyVisibility() {
    const overrides = this.userSettings.graphicsOverrides();
    if (!overrides.mapLayerVisibility || !this.gameMap.layers) return;
    for (const layer of this.gameMap.layers) {
      const vis = overrides.mapLayerVisibility[layer.id];
      if (vis !== undefined) {
        this.view.setLayerVisible(layer.id, vis);
      }
    }
  }

  private applyAlpha() {
    const overrides = this.userSettings.graphicsOverrides();
    if (!this.gameMap.layers) return;
    for (const layer of this.gameMap.layers) {
      const alpha = overrides.mapLayerAlpha?.[layer.id];
      if (alpha !== undefined) {
        this.view.setLayerAlpha(layer.id, alpha);
      } else if (layer.alpha !== undefined) {
        // Apply manifest default when no user override exists.
        this.view.setLayerAlpha(layer.id, layer.alpha);
      }
    }
  }
}
