"""Agentic-development friction audit for this repo's omp sessions.

Mined from ~/.omp/agent/sessions/--D--Finance Game--/*.jsonl using only fields
the harness writes: assistant `usage` + `contextSnapshot`, `toolResult.isError`,
and `customType == "advisor"` interventions.

Usage (read-only):
  python scripts/agent_audit.py summary      per-session cost + friction table
  python scripts/agent_audit.py friction     edit hygiene, dup calls, read churn
  python scripts/agent_audit.py errors       tool-error signatures + examples
  python scripts/agent_audit.py advisories   advisor interventions by severity
  python scripts/agent_audit.py hygiene      working tree vs AGENTS.md rules

Dev tooling. Not part of the game build; `npm run check` ignores scripts/.
"""

import glob
import json
import os
import re
import subprocess
import sys

SESSIONS = os.path.join(os.path.expanduser("~"), ".omp", "agent", "sessions", "--D--Finance Game--")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SIGS = [
    ("edit-text-mismatch", r"did not match|has 0 occurrences"),
    ("edit-syntax-reject", r"needs\s*[»>]"),
    ("edit-stale-or-fake-hash", r"hash #\w+ is not from this session|file changed between read and edit"),
    ("edit-overlapping-hunk", r"already targeted by another hunk"),
    ("path-not-found", r"(ENOENT|no such file|cannot find the path|Path '.*' not found)"),
    ("cmd-not-found", r"(command not found|not recognized|Could not find files)"),
    ("shell-dialect", r"(ParserError|At line:1 char|syntax error near|unexpected EOF|syntax error at line)"),
    ("timeout", r"(timed out|Timeout waiting)"),
    ("typecheck-error", r"error TS\d{4}"),
    ("test-failure", r"(\bFAIL\s|\d+ failed)"),
    ("tool-arg-schema", r"(Validation failed for tool|must be a string|path must be)"),
    ("browser-device", r"(Browser |CDP endpoint|Protocol error|chrome\.exe|tab is not visible)"),
    ("skipped-result", r"Skipped due to (queued user message|pending system advisory)"),
    ("context-shaken", r"\[shaken ~\d+ tokens"),
    ("nonzero-exit", r"exited with code [1-9]"),
]

SELECTOR = re.compile(r":(\d[\d\-+,]*|raw[\d\-+,]*|conflicts|img)$")


def strip_selector(path):
    return SELECTOR.sub("", str(path))


def records(path):
    out = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def text_of(message):
    content = message.get("content")
    if isinstance(content, list):
        return "".join(b.get("text", "") for b in content if b.get("type") == "text")
    return str(content)


def analyze(name, recs):
    st = {
        "name": name[:19], "title": None, "models": {}, "turns": 0, "calls": 0, "multi": 0,
        "errs": 0, "tokens": 0, "peak": 0, "epochs": set(), "tools": {}, "sig": {},
        "bytes": 0, "spill": 0, "dup": {}, "reads": {}, "advice": [], "events": {},
        "user": [], "edit_blind": 0, "edits": 0, "wall_h": None, "examples": [], "prompt_sum": 0,
    }
    pending = {}
    recent = []
    t0 = t1 = None
    for r in recs:
        typ = r.get("type")
        if typ == "session":
            st["title"] = r.get("title")
        elif typ == "model_change":
            st["models"][r.get("model")] = st["models"].get(r.get("model"), 0) + 1
        elif typ in ("custom", "custom_message"):
            ct = r.get("customType")
            st["events"][ct] = st["events"].get(ct, 0) + 1
            data = r.get("data")
            if ct == "tool_execution_start" and isinstance(data, dict):
                pending[data.get("toolCallId")] = data.get("args") or {}
            elif ct == "advisor":
                st["advice"].append(r.get("content") or "")
            blob = json.dumps(data if data is not None else r.get("content"))
            if "still open" in blob:
                st["events"]["todo-open-nudge"] = st["events"].get("todo-open-nudge", 0) + 1
        elif typ != "message":
            continue
        m = r.get("message")
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        stamp = m.get("timestamp")
        if isinstance(stamp, int):
            t0 = t0 or stamp
            t1 = stamp
        if role == "user":
            txt = " ".join(b.get("text", "") for b in m.get("content", []) if b.get("type") == "text").strip()
            if txt:
                st["user"].append(txt)
        elif role == "assistant":
            st["turns"] += 1
            usage = m.get("usage") or {}
            st["tokens"] += usage.get("totalTokens", 0)
            snap = m.get("contextSnapshot") or {}
            st["peak"] = max(st["peak"], snap.get("promptTokens") or 0)
            st["prompt_sum"] += snap.get("promptTokens") or 0
            if snap.get("compactionEpoch") is not None:
                st["epochs"].add(snap["compactionEpoch"])
            calls = [b for b in m.get("content", []) if b.get("type") == "toolCall"]
            st["calls"] += len(calls)
            st["multi"] += 1 if len(calls) > 1 else 0
            for c in calls:
                tool = c.get("name")
                st["tools"][tool] = st["tools"].get(tool, 0) + 1
                args = c.get("arguments") or {}
                pending[c.get("id")] = args
                key = "%s|%s" % (tool, json.dumps(args, sort_keys=True)[:300])
                st["dup"][key] = st["dup"].get(key, 0) + 1
                if tool == "read":
                    p = strip_selector(args.get("path", "")).lower()
                    st["reads"][p] = st["reads"].get(p, 0) + 1
                    recent.append(p)
                    recent = recent[-12:]
                elif tool == "edit":
                    st["edits"] += 1
                    leaf = str(args.get("path", "")).split("#")[0].replace("\\", "/").rsplit("/")[-1].lower()
                    if not any(leaf in p for p in recent):
                        st["edit_blind"] += 1
        elif role == "toolResult":
            txt = text_of(m)
            st["bytes"] += len(txt)
            st["spill"] += 1 if len(txt) > 12000 else 0
            if not m.get("isError"):
                continue
            st["errs"] += 1
            head = txt[:4000]
            hits = [nm for nm, pat in SIGS if re.search(pat, head, re.IGNORECASE)]
            for h in hits or ["other"]:
                st["sig"][h] = st["sig"].get(h, 0) + 1
            st["examples"].append({
                "sess": name[5:16], "tool": m.get("toolName"), "sig": hits,
                "head": head[:230].replace("\n", " | "),
                "args": json.dumps(pending.get(m.get("toolCallId"), {}))[:160],
            })
    if t0 and t1:
        st["wall_h"] = round((t1 - t0) / 3.6e6, 2)
    st["epochs"] = sorted(st["epochs"])
    return st


def load():
    rows = []
    for p in sorted(glob.glob(os.path.join(SESSIONS, "*.jsonl")), key=os.path.getmtime):
        st = analyze(os.path.basename(p), records(p))
        if st["turns"] > 3:
            rows.append(st)
    return rows


def merge(rows, field):
    out = {}
    for st in rows:
        for k, v in st[field].items():
            out[k] = out.get(k, 0) + v
    return out


def top(d, n=15, minv=1):
    return sorted(((k, v) for k, v in d.items() if v >= minv), key=lambda kv: -kv[1])[:n]


def summary(rows):
    hdr = "%-17s %-30s %5s %5s %5s %4s %5s %8s %4s %10s %5s %6s"
    print(hdr % ("session", "title", "turns", "calls", "multi", "err", "spill", "peakCtx",
                 "cps", "tokens", "wall", "advis"))
    for st in rows:
        print(hdr % (st["name"][:17], (st["title"] or "?")[:30], st["turns"], st["calls"],
                     st["multi"], st["errs"], st["spill"], st["peak"], len(st["epochs"]),
                     st["tokens"], st["wall_h"], len(st["advice"])))
    tot = {}
    for k in ("turns", "calls", "multi", "errs", "spill", "tokens", "bytes"):
        tot[k] = sum(st[k] for st in rows)
    print("TOTAL", tot)
    turns = max(1, sum(st["turns"] for st in rows))
    print("mean prompt tokens/turn:", int(sum(st["prompt_sum"] for st in rows) / turns))
    print("tool mix:", top(merge(rows, "tools"), 12))
    print("error signatures:", top(merge(rows, "sig"), 20))
    print("harness events:", top(merge(rows, "events"), 14))


def friction(rows):
    print("== identical repeated calls (>=3) ==")
    for k, v in top(merge(rows, "dup"), 15, 3):
        print("  %2d  %s" % (v, k[:165]))
    print("\n== re-read files (>=5) ==")
    for k, v in top(merge(rows, "reads"), 20, 5):
        print("  %3d  %s" % (v, k[:110]))
    print("\n== edits with no recent read of that file ==")
    for st in rows:
        print("  %-17s edits=%-4d blind=%d" % (st["name"][:17], st["edits"], st["edit_blind"]))


def errors(rows):
    seen = set()
    for st in rows:
        for e in st["examples"]:
            k = e["tool"] + e["head"][:70]
            if k in seen:
                continue
            seen.add(k)
            print("[%s %s] %s :: %s" % (e["sess"], e["tool"], e["head"][:170], e["args"][:120]))


def advisories(rows):
    for st in rows:
        for a in st["advice"]:
            sev = re.search(r'severity="([^"]+)"', a)
            print("\n### %s [%s] %s" % (st["name"][:16], sev.group(1) if sev else "?",
                                        (st["title"] or "?")[:34]))
            print(re.sub(r"<[^>]+>", " ", a).replace("\n", " ")[:900])


def sh(cmd):
    r = subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True,
                       encoding="utf-8", errors="replace")
    return (r.stdout or "") + (r.stderr or "")


def hygiene(_rows):
    print("cwd:", REPO)
    print("-- git status --")
    print(sh("git status --short --branch"))
    print("-- last 5 commits --")
    print(sh("git log --oneline -5"))
    print("-- sources over 400 lines (AGENTS.md cap) --")
    src = glob.glob(os.path.join(REPO, "src", "**", "*.ts"), recursive=True)
    for n, p in sorted(((sum(1 for _ in open(f, encoding="utf-8", errors="replace")), f)
                        for f in src), reverse=True):
        if n > 400:
            print("  %4d %s" % (n, os.path.relpath(p, REPO)))
    print("-- docs / plans --")
    for pat in ("docs/*.md", ".omp/plans/*.md", ".omp/reports/*.md", "out*.txt", "relay.mjs"):
        print("  %-20s %s" % (pat, [os.path.relpath(x, REPO) for x in glob.glob(os.path.join(REPO, pat))]))


MODES = {"summary": summary, "friction": friction, "errors": errors,
         "advisories": advisories, "hygiene": hygiene}

rows_ = load()
MODES[sys.argv[1] if len(sys.argv) > 1 else "summary"](rows_)
