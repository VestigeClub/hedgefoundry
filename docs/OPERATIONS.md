# HedgeFoundry — Repository Operations

Status: v1.0 (2026-08-27) · Owner: Zain · Audience: every agent session in this repo.

This is the file `AGENTS.md` §Repo layout promises: how work gets *executed* here —
edit discipline, verification, shell rules, subagent ownership, session hygiene.
`docs/DESIGN.md` is the contract for **what** to build; this is the contract for
**how** to build it without wrecking it. Every rule below was earned from a measured
failure; the evidence and numbers live in `.omp/reports/2026-08-27-ruckus-session-friction.md`
(local scratch, not tracked).

Re-measure friction any time: `python scripts/agent_audit.py summary|friction|errors|advisories|hygiene`.

---

## 1. Edit discipline (the rule that matters most)

Line-anchored patch tools are precise and unforgiving. Measured on 2026-08-27: 54
patch rejections and **eight silent corruptions that a single scoped check would have
caught** — a lost `if (e.hp <= 0)` guard, a lost `return true`, three tech definitions
deleted from a list, a function spliced into the middle of another one, a passing test's
body removed.

1. **Read, then patch, in the same turn.** Never reproduce file text from memory, and
   never invent a snapshot tag — copy it from the read you just did.
2. **One hunk per contiguous range.** Never span an elided (`…`) region; never let two
   hunks touch the same line.
3. **Multi-function change, or a file you have not fully read → rewrite the whole file.**
   Read it complete, write it complete. Files here are 200–600 lines; a whole-file write
   is cheaper than six repair rounds. This repo paid for that lesson twice — see the
   commits titled `chore: wholesale rewrite of update.ts`. **Cite commit subjects, not shas:**
   history was re-authored on 2026-08-27 and every sha written before it changed (the shas in
   this file were checked afterwards, not copied from a rewritten log).
4. **After every file-level change, run the scoped check** (§3). No exceptions, including
   "obviously trivial" edits — the eight corruptions were all obviously trivial.
5. **Data lists get an invariant test.** Anything where silent deletion is possible
   (`TECHS` in `sim/research.ts:52`, `BUILD_ORDER` in `ui/build.ts:12`, `ITEMS`,
   `DEFAULT_COINS`) needs a uniqueness/length assertion, so removal fails loudly instead of
   quietly unbalancing the game. `TECHS` already has one (`research.test.ts:34`); the rest do not.

## 2. Milestones and commits

A milestone is: one file group changed → scoped check green → **commit**. Then, at a
boundary, the full gate → commit again.

- Never end a session with a dirty tree. Measured worst case: 42 dirty paths, no commit
  for five hours, gate red, and a `git diff` too scrambled to trust.
- Commit messages use the existing style: `fix(sim): …`, `feat(ui): …`, `test(sim): …`.
- **The index is shared between sessions.** `git add <paths>` then `git commit` commits
  *everything staged*, not just your paths — a process-docs commit here swept in another
  session's eight staged files. Check `git diff --cached --name-only` before, and
  `git show --name-only HEAD` after, every commit.
- **Never `--amend` or `reset` in a tree another session might commit to.** An amend meant
  for my own commit landed on the sibling's and replaced its message (recovered only from
  the reflog). Fix forward with a new commit instead.
- Plan files in `.omp/plans/` carry a `Status:` line with the last commit hash and the
  next action. On resume, read `git log -1` plus that line — do not ask the user where
  the work stands.
- One milestone, one session where possible. Riding a fourth compaction is how sessions
  start answering questions nobody asked.

## 3. Verification ladder

| scope | command | use |
|---|---|---|
| after each file change | `npx tsc --noEmit` (typo: see below) | no |
| after each file change | `npm run typecheck` | ~5 s, always |
| while iterating on one behaviour | `npx vitest run src/sim/<file>.test.ts -t "<case>"` | scoped |
| milestone boundary | `npm run check` | typecheck + tests + build, **unfiltered** |

- **Never pipe the gate through `grep`/`head`.** Cutting it to four lines hides the
  failure it just printed; the same command was re-run 17 times once. Full output is
  captured and re-readable from the artifact link, so filtering buys nothing.
- **Never write debug output into tracked paths.** If a file dump is unavoidable it goes to
  `.scratch/` (git-ignored, git-cleanable), never `out.txt` / `arc.txt` in the repo root —
  those are re-invented under a new name every session. Prefer the artifact link: tool output
  is captured and re-readable by range, so a file adds nothing.
- The scripted-win reachability test is a 50-minute simulated arc and costs ~21 s. Do not
  use it as an inner loop: debug the sub-invariant (one belt→desk delivery, one billing
  tick, one lab's supply/demand ratio) with a millisecond unit probe, and keep the arc for
  the boundary gate.
- **A skipped tool result is not an execution.** Results marked "Skipped due to queued
  user message / pending system advisory" must be re-run before anything cites them.
- A failed or empty subagent report is not a finding. Verify the child's claims against
  the files before integrating them.

## 4. Shell rules (Windows box, POSIX `bash` tool)

The `bash` tool is real bash; cmd and PowerShell syntax fail in it, and backslashes get
eaten.

- Use bash syntax and forward slashes: `/c/Program Files/GitHub CLI/gh.exe`, `2>/dev/null`,
  `cd` without `/d`, `ls`/`find` equivalents via the `glob` and `read` tools — not
  `dir /s /b` or `for /f`.
- PowerShell only as `powershell -NoProfile -Command '…'` with **single** quotes (double
  quotes let bash eat `$vars`), or write a `.ps1` with the `write` tool and run that.
- Quoting-heavy or multiline work goes to the `eval` kernel, not bash. Never assign to a
  module attribute in a persistent kernel (`os.path.expanduser = None` poisons every
  later cell); start a fresh process instead of trying to un-poison it.
- Commands handed to the human get **verified against the installed binary first**
  (`"$GH" repo create --help`), with the target shell named, and no shell substitution
  inside a snippet he will paste.

## 5. Subagents

- Declare **file ownership** in the batch context. Each child owns a disjoint set; the
  parent keeps the shared sim files (`src/sim/update.ts`, `src/main.ts`). Cross-editing a
  sibling's file caused stale patch anchors and children asking the parent for permission
  mid-run.
- Children report a blocker and stop; they do not reach into another file to work around it.
- Read-only investigation goes to a scout that returns **≤60 lines**. Three 40 KB audit
  reports read back into the parent were pure context cost.
- One integration owner applies the merges; nobody else touches the shared files while it does.

## 6. Context budget

Mean context re-sent per turn was 163 k tokens; sessions peaked at 405 k with up to four
compactions; ten requests were rejected outright by the model window (§8).

- Read with a selector (`path:220-260`), not the whole file. Parseable reads print the
  exact range to re-issue — use it.
- Do not re-read a file you just patched; the patch response renumbers it. Measured churn:
  one test file read 118 times, one debug dump 31 times.
- Recover bulk output from the artifact with a range instead of re-running the command.
- Exploration goes through `checkpoint`/`rewind`; research through a scout. Raw feed
  fixtures (`.jsonl` dumps) are parsed by tests, never pasted into context.
- Before acting, restate the instruction from the **last user message**. If the reasoning
  cannot name the message it is answering, discard it and re-read that message plus the
  plan `Status:` line.

## 7. Visual verification

UI/rendering claims need the real surface: run the game (`npm run dev` / `npm run preview`)
and drive it. Prefer the sim hooks (`window.__HF`) and assert on numbers — entity counts,
row counts, world state — over pixels; snapshot the accessibility tree before screenshots;
open one named tab and reuse it. If no browser device is available, **say the claim is
unproven** and hand the URL to the user. An HTTP 200 is not proof the game runs.

## 8. Context ceiling (owner-directed, agent-applied)

Observed 2026-08-27: ten HTTP 400s against the ruckus lane — *"262144 max context; you
requested 64000 output and your prompt contains at least 198145 input tokens"* — of which
five happened **after** the 21:00 UTC `config.yml` edit, each still asking for 64,000
completion tokens. `198145 = 262144 − 64000 + 1`, so the margin is one token. The existing
`compaction.thresholdPercent: 70` is necessary but not sufficient: compaction is a guess,
the arithmetic is a law.

Applied 2026-08-27 23:05 UTC on the owner's instruction ("GO on A, don't do anything upstream,
fix it locally"): `compaction.thresholdPercent: 70 → 60`, one line at
`~/.omp/agent/config.yml:14`, backup `config.yml.bak-20260827-ctx-ceiling` (verified by
`diff`: `14c14` and nothing else). At 60 % the estimate caps at 157.3k, so
157.3k + 64k = 221.3k — ~41k under the 262,144 window, and ~26k of clearance above the
measured +15k tokenizer drift.

Three honest limits on this:
- A turn's tool output is appended *after* the threshold check, so one oversized dump can
  still cross the 198,144 floor. §1 and §6 (stop re-reading the same file 118 times, keep
  files short) are the fix for that, not a smaller number.
- `maxTokens: 65536` in `models.yml:12,40,63` is deliberately untouched. Halving it buys 32k
  of headroom but truncates the wholesale rewrites §1 requires (`update.ts` is 615 lines),
  trading a loud failure for a silent one. Splitting those files is what makes a lower output
  cap affordable.
- Config binds at session start. The session that produced the 400s (started 16:58 UTC) still
  holds 70 % in memory until it is restarted.

Not done, deliberately: the durable fix belongs to the harness — bound the completion per
request (`max_completion_tokens = min(default, ctx − promptTokens − margin)`) and refuse to
send above the threshold rather than trusting compaction to shrink in time. The owner scoped
this to local config, so it is recorded here rather than filed upstream.

Lowering the prompt stays the real lever regardless: §6 keeps a session away from the ceiling,
and §2 keeps sessions short enough never to approach it.

**Browser device — the real state (verified 2026-08-27).** The device is configured in
`~/.omp/agent/config.yml`, not a `settings.yml` (no such file exists):

```yaml
browser:
  relay: true      # checked FIRST when a call carries no `app`
  headless: true   # only reached if relay is off
```

Because `browser.relay` precedes `browser.headless`, every `open` attaches to Zain's own
Chrome through the loopback relay. The relay endpoint is up (`127.0.0.1:9224/json/version`
answers 200, `Chrome/151.0.0.0`), but the sessions that did get the device recorded
`ERR_ABORTED` on navigation — even a `data:` URL (`docs/BUILD_LOG.md:83-86`) — and in others
the tool never mounted at all (`Tool xd__browser not found`). **Consequence: no UI claim in
this repo is visually verified.** Treat the device as unavailable.

Owner options, one line each:

- **Isolated (recommended for this project):** `browser.relay: false` → resolution falls
  through to `browser.headless: true`, using the Chromium already on disk at
  `~/.cache/puppeteer/chrome/win64-151.0.7922.77` (verified present). Deterministic, no
  access to logged-in tabs.
- **Keep the relay:** run `omp browser-relay install` once and check the extension badge.
  Powerful, but agents then drive the real browser under his account — named local preview
  tabs only.

Until one of those is in place and an `open about:blank` succeeds, agents must say
**"unproven"** and hand over `npm run preview` instead of substituting an HTTP check.

## 9. Boundaries

- Anything needing the user's credentials, browser consent, or OTP is handed over as a
  verified command and then **stopped** — not executed.
- Never run destructive git (`git reset --hard`, `git clean -f`) — the harness denies it
  for a reason. Repair forward, or ask.
- Fleet/serving work (model pulls, lane config) does not run from this cwd. It belongs in
  `D:\Workspace`; running it here mixed 41 M tokens of unrelated state into this project's
  history and memory.
- Never claim a fix without a check that would have failed before it.
