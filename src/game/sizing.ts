// Race-stage geometry. Everything on the race screen is derived from one "lane height"; these pure helpers keep the
// JavaScript (which picks the lane height for the window) and styles.css (which lays the stage out from it) in step.

/** Scenery band above the road, in lane heights. */
export const SCENERY_LANES = 2.2;
export const ROAD_LANES = 5;
/** Speedometer diameter: at least this many px, and at least `GAUGE_LANES` lane heights. */
export const GAUGE_MIN_PX = 84;
export const GAUGE_LANES = 1.7;
/** The typing bar is as tall as the gauge plus this much breathing room. */
export const BAR_PAD_PX = 12;

export const gaugeSize = (lane: number): number => Math.max(GAUGE_MIN_PX, GAUGE_LANES * lane);
export const typebarHeight = (lane: number): number => gaugeSize(lane) + BAR_PAD_PX;
export const stageHeight = (lane: number): number => lane * (SCENERY_LANES + ROAD_LANES) + typebarHeight(lane);

const LANE_MIN = 26;
const LANE_NARROW_MIN = 38;
const LANE_MAX = 72;

/**
 * The lane height for a window: grows with the width (capped, like the reel's proportions) and shrinks until the whole
 * stage fits the *visible* height, so the typing bar stays above an on-screen keyboard on phones.
 */
export function laneHeightFor(width: number, height: number): number {
  let lane = Math.min(LANE_MAX, Math.max(LANE_NARROW_MIN, width * 0.115));
  while (stageHeight(lane) > height && lane > LANE_MIN) lane -= 0.5;
  return Math.max(LANE_MIN, lane);
}
