/** Keep strategic information legible independent of terrain zoom. */
export function playerLabelWidth(countrySize: number, zoom: number): number {
  return Math.max(180, Math.min(240, countrySize * zoom * 1.7));
}
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export function troopLabel(troops: number | undefined): string {
  return troops === undefined
    ? "Troops: —"
    : `Troops: ${compact.format(Math.max(0, Math.floor(troops)))}`;
}
