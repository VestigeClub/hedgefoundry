/** Coach card (DESIGN.md §8a) — the tutorial's visible surface. Patch-on-
 * change like the Hud: text nodes swap, structure does not, so live repaints
 * never replace a node under the cursor. */
import type { TutorialStep } from "./steps";

const MARKUP = `
  <div class="tut-card">
    <div class="tut-title"></div>
    <div class="tut-trouble" hidden></div>
    <div class="tut-body"></div>
    <div class="tut-chips"></div>
    <button class="tut-skip" type="button">SKIP TUTORIAL</button>
  </div>
`;

export class TutorialCard {
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly trouble: HTMLElement;
  private readonly body: HTMLElement;
  private readonly chips: HTMLElement;
  private lastChips: string | null = null;
  private lastTrouble: string | null = null;

  constructor(root: HTMLElement, onSkip: () => void) {
    root.innerHTML = MARKUP;
    this.card = root.querySelector(".tut-card")!;
    this.title = root.querySelector(".tut-title")!;
    this.trouble = root.querySelector(".tut-trouble")!;
    this.body = root.querySelector(".tut-body")!;
    this.chips = root.querySelector(".tut-chips")!;
    root.querySelector<HTMLButtonElement>(".tut-skip")!.addEventListener("click", onSkip);
  }

  setStep(step: TutorialStep): void {
    if (this.title.textContent !== step.title) this.title.textContent = step.title;
    if (this.body.textContent !== step.body) this.body.textContent = step.body;
    const markup = (step.chips ?? []).map((c) => `<span class="tut-chip">${c}</span>`).join("");
    if (this.lastChips !== markup) {
      this.lastChips = markup;
      this.chips.innerHTML = markup;
    }
    this.card.hidden = false;
  }

  setTrouble(tip: string | null): void {
    if (this.lastTrouble === tip) return;
    this.lastTrouble = tip;
    this.trouble.textContent = tip ?? "";
    this.trouble.hidden = tip === null;
  }

  hide(): void {
    this.card.hidden = true;
  }
}
