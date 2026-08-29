/**
 * Tutorial controller (DESIGN.md §8a). Owns the ordered step list, throttles
 * predicate checks to ~10 Hz, and tracks the capital trough for the income
 * step. Pure logic — DOM and canvas live in card.ts / highlight.ts.
 */
import type { World } from "../sim/world";
import { troubleTip, TUTORIAL_STEPS, type StepCtx } from "./steps";

export interface TutorialSnapshot {
  /** Index into TUTORIAL_STEPS (== length after the send-off). */
  step: number;
  done: boolean;
  /** Contextual trouble tip for this moment, or null. */
  trouble: string | null;
  /** True only on the update that moved to a new step (card rebuild). */
  stepChanged: boolean;
}

/** Serializable progress (save.ts `tutorial?` field). */
export interface TutorialProgress {
  step: number;
  done: boolean;
}

const THROTTLE_MS = 100;

export class Tutorial {
  private idx = 0;
  private finished = false;
  private acc = 0;
  private stepMs = 0;
  private trough = 0;

  /** Resume from persisted progress; a mid-stream resume is valid. */
  constructor(progress?: TutorialProgress) {
    if (progress) {
      this.idx = Math.min(Math.max(progress.step, 0), TUTORIAL_STEPS.length);
      this.finished = progress.done;
    }
  }

  get snapshot(): TutorialSnapshot {
    return { step: this.idx, done: this.finished, trouble: null, stepChanged: false };
  }

  progress(): TutorialProgress {
    return { step: this.idx, done: this.finished };
  }

  skip(): void {
    this.finished = true;
  }

  update(w: World, dtMs: number, input: { cameraMoved: boolean }): TutorialSnapshot {
    if (this.finished) return this.snapshot;
    this.acc += dtMs;
    if (this.acc < THROTTLE_MS) return this.snapshot;

    this.stepMs += this.acc;
    this.acc = 0;
    const ctx: StepCtx = { cameraMoved: input.cameraMoved, elapsedMs: this.stepMs, trough: this.trough };
    const trouble = troubleTip(w);

    let changed = false;
    const step = TUTORIAL_STEPS[this.idx];
    if (step && step.done(w, ctx)) {
      this.idx++;
      this.stepMs = 0;
      this.trough = w.capital;
      if (this.idx >= TUTORIAL_STEPS.length) this.finished = true;
      changed = true;
    } else if (this.trough === 0 || w.capital < this.trough) {
      this.trough = w.capital;
    }
    return { step: this.idx, done: this.finished, trouble, stepChanged: changed };
  }
}
