/**
 * Help overlay (H — DESIGN.md §8 chrome): a static key reference for the
 * controls the build bar does not advertise. Dismissed with H, Escape, any
 * other key, or a click.
 */
export class HelpOverlay {
  private open_ = false;

  constructor(private readonly el: HTMLElement) {
    this.el.innerHTML = `
      <div class="help-box">
        <div class="help-title">KEYS</div>
        <dl>
          <dt>1–9, 0, Q, E, G</dt><dd>build menu</dd>
          <dt>R</dt><dd>rotate belt / trader</dd>
          <dt>X</dt><dd>demolish selected (50% refund)</dd>
          <dt>T</dt><dd>research panel</dd>
          <dt>S</dt><dd>stats panel</dd>
          <dt>SPACE</dt><dd>pause</dd>
          <dt>- / =</dt><dd>slower / faster</dd>
          <dt>B</dt><dd>blueprint copy / paste</dd>
          <dt>H</dt><dd>help</dd>
        </dl>
        <div class="help-dim">click or H to close</div>
      </div>`;
    this.el.addEventListener("click", () => this.hide());
    window.addEventListener("keydown", (e) => {
      if (this.open_ && e.code !== "KeyH") this.hide();
    });
  }

  get open(): boolean {
    return this.open_;
  }

  toggle(): void {
    if (this.open_) this.hide();
    else this.show();
  }

  show(): void {
    this.open_ = true;
    this.el.classList.add("show");
  }

  hide(): void {
    this.open_ = false;
    this.el.classList.remove("show");
  }
}
