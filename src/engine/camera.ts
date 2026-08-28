import { clamp } from "./num";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

/**
 * Camera: world px ↔ screen px transform with zoom. World origin (0,0) is the
 * top-left tile; (x, y) is the world point at the view's top-left corner.
 * Pure logic — unit-tested; no DOM access.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  constructor(
    private viewW: number,
    private viewH: number,
  ) {}

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  /**
   * Pan by a screen-space delta as a DRAG (grab-and-move-the-world): the
   * camera moves opposite the pointer, so content follows the cursor.
   */
  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Pan the camera in its own direction: pressing right moves right. Keys use this. */
  panByWorld(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
  }

  /** Zoom by factor around a screen anchor; the world point under the anchor stays fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.x = before.x - sx / this.zoom;
    this.y = before.y - sy / this.zoom;
  }

  /** Inclusive tile range visible in the view, for culling. */
  visibleTiles(tileSize: number): { x0: number; y0: number; x1: number; y1: number } {
    const x0 = Math.floor(this.x / tileSize);
    const y0 = Math.floor(this.y / tileSize);
    const x1 = Math.ceil((this.x + this.viewW / this.zoom) / tileSize);
    const y1 = Math.ceil((this.y + this.viewH / this.zoom) / tileSize);
    return { x0, y0, x1, y1 };
  }

  /** Center the view on a world-pixel point. */
  centerOn(wx: number, wy: number): void {
    this.x = wx - this.viewW / (2 * this.zoom);
    this.y = wy - this.viewH / (2 * this.zoom);
  }

  /** Keep the view inside the world rect (allows a half-view slack on tiny maps). */
  clampTo(worldW: number, worldH: number): void {
    const vw = this.viewW / this.zoom;
    const vh = this.viewH / this.zoom;
    this.x = clamp(this.x, -vw / 2, Math.max(-vw / 2, worldW - vw / 2));
    this.y = clamp(this.y, -vh / 2, Math.max(-vh / 2, worldH - vh / 2));
  }
}
