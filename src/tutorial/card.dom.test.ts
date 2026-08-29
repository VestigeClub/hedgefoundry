// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { TutorialCard } from "./card";
import { TUTORIAL_STEPS } from "./steps";

function harness(): { card: TutorialCard; el: HTMLElement; skipped: () => boolean } {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let skipped = false;
  const card = new TutorialCard(el, () => {
    skipped = true;
  });
  return { card, el, skipped: () => skipped };
}

describe("tutorial coach card", () => {
  it("swaps title/body/chips on setStep", () => {
    const { card, el } = harness();
    card.setStep(TUTORIAL_STEPS[0]!);
    expect(el.querySelector(".tut-title")!.textContent).toBe("WELCOME TO THE FUND");
    expect(el.querySelector(".tut-body")!.textContent).toContain("$400k");

    card.setStep(TUTORIAL_STEPS[3]!);
    expect(el.querySelector(".tut-title")!.textContent).toBe("CLEAN IT");
    expect(el.querySelectorAll(".tut-chip")).toHaveLength(2);
  });

  it("shows the trouble tip and clears it", () => {
    const { card, el } = harness();
    card.setStep(TUTORIAL_STEPS[0]!);
    const trouble = el.querySelector<HTMLElement>(".tut-trouble")!;
    expect(trouble.hidden).toBe(true);

    card.setTrouble("Brownout: build Funding Desks and Treasury Vaults (7/8) — power is capital.");
    expect(trouble.hidden).toBe(false);
    expect(trouble.textContent).toMatch(/brownout/i);

    card.setTrouble(null);
    expect(trouble.hidden).toBe(true);
  });

  it("skip button fires the callback exactly once per click", () => {
    const { card, el, skipped } = harness();
    card.setStep(TUTORIAL_STEPS[0]!);
    const btn = el.querySelector<HTMLButtonElement>(".tut-skip")!;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(skipped()).toBe(true);
  });

  it("hide removes the card from flow", () => {
    const { card, el } = harness();
    card.setStep(TUTORIAL_STEPS[0]!);
    expect(el.querySelector<HTMLElement>(".tut-card")!.hidden).toBe(false);
    card.hide();
    expect(el.querySelector<HTMLElement>(".tut-card")!.hidden).toBe(true);
  });
});
