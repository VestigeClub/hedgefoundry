/** Keyboard + mouse input state. Positions are CSS pixels relative to the element. */

const KEY_REPEAT_BLOCK = new Set(["Space"]);

export class Input {
  readonly keys = new Set<string>();
  mouse = { x: 0, y: 0, left: false, middle: false, right: false };
  private wheelAcc = 0;
  private readonly listeners: Array<() => void> = [];

  constructor(private readonly el: HTMLElement) {
    const on = <K extends keyof WindowEventMap>(
      type: K,
      handler: (e: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      addEventListener(type, handler, opts);
      this.listeners.push(() => removeEventListener(type, handler));
    };

    on("keydown", (e) => {
      if (KEY_REPEAT_BLOCK.has(e.code) && e.repeat) return;
      this.keys.add(e.code);
      e.preventDefault();
    });
    on("keyup", (e) => {
      this.keys.delete(e.code);
    });
    on("mousemove", (e) => {
      const r = this.el.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    on("mousedown", (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 1) this.mouse.middle = true;
      if (e.button === 2) this.mouse.right = true;
    });
    on("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 1) this.mouse.middle = false;
      if (e.button === 2) this.mouse.right = false;
    });
    on(
      "wheel",
      (e) => {
        e.preventDefault();
        this.wheelAcc += e.deltaY;
      },
      { passive: false },
    );
    on("blur", () => {
      this.keys.clear();
      this.mouse.left = this.mouse.middle = this.mouse.right = false;
    });
    on("contextmenu", (e) => e.preventDefault());
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
