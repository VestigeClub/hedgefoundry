/** Keyboard + mouse input state. Positions are CSS pixels relative to the element. */

const KEY_REPEAT_BLOCK: Record<string, true> = { Space: true };

/** Keys the game consumes that would otherwise scroll the page. */
const SCROLL_KEYS: Record<string, true> = {
  Space: true,
  ArrowUp: true,
  ArrowDown: true,
  ArrowLeft: true,
  ArrowRight: true,
};

/** Keys a focused button handles itself (activation) — the game must not eat them. */
const BUTTON_KEYS: Record<string, true> = { Space: true, Enter: true, NumpadEnter: true };

export class Input {
  readonly keys = new Set<string>();
  mouse = { x: 0, y: 0, left: false, middle: false, right: false };
  private wheelAcc = 0;
  private readonly listeners: Array<() => void> = [];

  constructor(private readonly el: HTMLElement) {
    const onWin = <K extends keyof WindowEventMap>(
      type: K,
      handler: (e: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      addEventListener(type, handler, opts);
      this.listeners.push(() => removeEventListener(type, handler));
    };
    const onEl = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      this.el.addEventListener(type, handler, opts);
      this.listeners.push(() => this.el.removeEventListener(type, handler));
    };

    onWin("keydown", (e) => {
      if (KEY_REPEAT_BLOCK[e.code] && e.repeat) return;
      const t = e.target as HTMLElement | null;
      // Never steal typing from a field, or activation from a focused button.
      if (t?.closest("input,textarea,select,[contenteditable]")) return;
      if (t?.closest("button") && BUTTON_KEYS[e.code]) return;
      this.keys.add(e.code);
      if (SCROLL_KEYS[e.code]) e.preventDefault();
    });
    onWin("keyup", (e) => {
      this.keys.delete(e.code);
    });
    // Mouse lives on the canvas: a click on the HUD/build bar must not also
    // reach the world (that placed buildings under the toolbar).
    onEl("mousemove", (e) => {
      const r = this.el.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    onEl("mousedown", (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 1) this.mouse.middle = true;
      if (e.button === 2) this.mouse.right = true;
    });
    // Release on the window: letting go outside the canvas must not leave a
    // button stuck down.
    onWin("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 1) this.mouse.middle = false;
      if (e.button === 2) this.mouse.right = false;
    });
    onEl(
      "wheel",
      (e) => {
        e.preventDefault();
        this.wheelAcc += e.deltaY;
      },
      { passive: false },
    );
    onWin("blur", () => {
      this.keys.clear();
      this.mouse.left = this.mouse.middle = this.mouse.right = false;
    });
    onEl("contextmenu", (e) => e.preventDefault());
  }

  /** Wheel delta accumulated since last call (positive = scroll down/zoom out). */
  consumeWheel(): number {
    const w = this.wheelAcc;
    this.wheelAcc = 0;
    return w;
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
  }
}
