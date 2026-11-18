export interface ResponsiveZoomOptions {
  worldWidthPx: number;
  worldHeightPx: number;
  minZoom?: number;
  refWidth?: number;
  refHeight?: number;
}

/**
 * Computes a camera zoom level that scales proportionally with browser resolution
 * while guaranteeing the camera viewport never exceeds the world/room dimensions
 * (preventing black/dark bars at any aspect ratio or monitor size).
 */
export function computeResponsiveZoom(
  viewportW: number,
  viewportH: number,
  opts: ResponsiveZoomOptions,
): number {
  const vw = Math.max(320, viewportW);
  const vh = Math.max(200, viewportH);
  const minZoom = opts.minZoom ?? 3;
  const refW = opts.refWidth ?? 1280;
  const refH = opts.refHeight ?? 720;

  // Scale zoom proportionally above the 1280x720 baseline (426x240 visible world px)
  const scaleW = (vw / refW) * minZoom;
  const scaleH = (vh / refH) * minZoom;
  const adaptiveZoom = Math.max(minZoom, Math.min(scaleW, scaleH));

  // Ensure the camera viewport never exceeds the rendered world/room bounds
  const coverZoomW = vw / Math.max(1, opts.worldWidthPx);
  const coverZoomH = vh / Math.max(1, opts.worldHeightPx);

  return Math.max(adaptiveZoom, coverZoomW, coverZoomH);
}
