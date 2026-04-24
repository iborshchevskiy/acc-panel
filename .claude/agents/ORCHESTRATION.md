# AccPanel Agent Orchestration Protocol

Loop-proof contract for subagent use. The **orchestrator (main Claude)** is the only router — no agent talks to another agent. Every agent starts cold, returns one message, terminates.

> **Git discipline:** every code-editing agent follows `.claude/agents/GIT_DISCIPLINE.md`. Feature branches only; `main` is production; Vercel auto-deploys from `main`; merges to `main` require Ilya's explicit go-ahead.

---

## Termination contract — every agent, every run

Each run MUST end with exactly one of:

```
DONE: <one-line summary of what shipped / what was found>
BLOCKED: <specific reason> | needs: <orchestrator action>
HANDOFF: <agent-name> | reason: <why>          ← advisory only; orchestrator decides whether to honor it
```

No other endings. No "I'll now call X". No "let me also check Y". Specialists report, they do not re-dispatch.

---

## Call graph (the only chains allowed)

Each arrow = one orchestrator turn. Max depth 2. No cycles.

```
User request
   │
   ├─► specialist (one of: frontend-polish, fifo-finance, db-drizzle,
   │                       blockchain-import, nextjs-app-router)
   │     │
   │     └─► verify-runtime              [gate before "done"]
   │
   ├─► schema change:
   │     db-drizzle ─► rls-security ─► verify-runtime
   │
   ├─► pre-merge review:
   │     code-reviewer (or rls-security for security-only diffs)
   │     └─► verify-runtime
   │
   ├─► ship iteration:
   │     release-iter     [runs npm scripts itself, no nested agents]
   │
   ├─► user documentation:
   │     docs-user        [writes to /app/help/*, adds sidebar entry, captures screenshots
   │                       against demo org only — may HANDOFF to frontend-polish for layout]
   │
   ├─► dev / AI-agent documentation:
   │     docs-dev         [edits CLAUDE.md, memory, agent files, and docs/internal/*.md
   │                       NEVER src/app/ or public/ — internal docs stay off the web]
   │
   ├─► design sanity check:
   │     ui-ux-reviewer   [read-only; may request a screenshot from docs-user via BLOCKED]
   │
   ├─► design critique → implementation:
   │     ui-ux-reviewer ─► frontend-polish ─► verify-runtime
   │
   └─► usability loop (BOUNDED, max 3 rounds — see "Usability loop" below):
         usability-tester ─► frontend-polish ─► [rls-security] ─► verify-runtime ─► usability-tester
```

Anything not on this graph requires an explicit Ilya green light.

---

## Hard rules

1. **No agent spawns another agent.** Subagents do not have the Agent tool; even if they did, this is forbidden.
2. **One specialist per turn.** Do not stack `frontend-polish` + `db-drizzle` on the same turn when the work touches both — split into two sequential turns so each has a clean scope.
3. **`verify-runtime` is terminal.** It runs checks, reports, returns. It never hands off anywhere.
4. **`rls-security` and `code-reviewer` are read-mostly.** They produce findings; the orchestrator decides who fixes them. They do not fix and then re-review in the same turn.
5. **Handoff is advisory, never automatic.** When an agent returns `HANDOFF:`, the orchestrator evaluates — it is allowed to say "no, you handle it" or escalate to Ilya.

---

## Loop-breakers (orchestrator enforces)

- **Max 2 agent invocations per user request** — EXCEPT the sanctioned usability loop (below).
- **Same agent, same failure, twice → stop.** Report the failure; do not re-invoke. Change approach or ask.
- **Circular handoff detected** (e.g. A → B → A) → abort the chain. Ilya decides.
- **Agent returns `BLOCKED` with the same reason twice** → the scope is wrong; the orchestrator must re-frame the task, not retry.
- **`verify-runtime` fails twice in a row** → stop. Paste failure, wait for Ilya.

---

## Usability loop (the one sanctioned recursive chain)

Triggered when Ilya says "run the usability loop", "test this like a user", "is this Excel-refugee-friendly", or an equivalent request.

### Chain per round

```
usability-tester           ← drives the app via Playwright, reports findings
       │
       ▼   (if SATISFIED: stop; if NOT_SATISFIED and round < 3: continue)
frontend-polish            ← implements the redesign directions from the findings
       │
       ▼
rls-security               ← runs UNLESS the diff is pure CSS/JSX-rearrange with no
                             server-action, API-route, or data-query change.
                             Orchestrator decides by inspecting the diff.
       │
       ▼
verify-runtime             ← npm run typecheck · lint · test · build
       │
       ▼
usability-tester           ← next round
```

### Hard cap and termination

- **Maximum 3 full rounds.** Round = one complete pass of tester → polish → [security] → verify → tester.
- After round 1's tester call, round counter is `1`.
- After each subsequent tester call, increment.
- **If the tester returns `DONE: SATISFIED` at any round → stop immediately, report success to Ilya.**
- **If the tester returns `DONE: NOT_SATISFIED` at round 3 → stop. Do not start round 4.** Notify Ilya with a final summary (see below).
- **If any non-tester step returns `BLOCKED:` or `verify-runtime` reports FAIL → stop immediately.** Fix the blocker or escalate to Ilya before resuming. The loop does not silently skip broken steps.

### The round-3-failure notification

After 3 rounds without SATISFIED, the orchestrator produces a single message to Ilya structured as:

```
USABILITY LOOP: 3 rounds, NOT SATISFIED.

Rounds ran:
  Round 1: <N blockers / M majors> — see brief at <path>
  Round 2: <N blockers / M majors> — see brief at <path>
  Round 3: <N blockers / M majors> — see brief at <path>

What improved across rounds:
- <specific item>
- <specific item>

What remained unresolved after 3 rounds:
- <specific item> — why the fix didn't land
- <specific item>

Recommendation:
- <either: larger architectural change, or: scope deferred, or: need Ilya's judgment on X>
```

This message is the trigger for Ilya to decide direction. The orchestrator does NOT auto-start round 4 under any circumstance.

### Rules for the loop

- **Round counter lives in the orchestrator's head**, not in any agent. Agents are stateless.
- **Each round's tester run must cover the full task battery**, not a diff-scoped subset. The whole app may regress when one area improves.
- **Each round's screenshots go under `public/docs/screenshots/usability/round-<N>/`** so Ilya can compare rounds after the fact.
- **`frontend-polish` implements only findings from the current round's brief.** It does not invent improvements. It does not reorder severity. It asks the orchestrator if a finding is ambiguous.
- **`rls-security`'s skip condition is explicit**: pure `.tsx` / `.css` edits with no server action, API route, DB query, or auth change. Orchestrator verifies via `git diff --stat`. When in doubt, run it.
- **No agent inside the loop may spawn another agent.** The orchestrator drives every transition.

---

## Information flow

- Orchestrator passes **concrete inputs**: file paths, line numbers, acceptance criteria, the claim being verified. No "figure it out" prompts.
- Orchestrator does **not** pass another agent's internal reasoning — only its findings. This keeps contexts independent and avoids cross-agent confusion.
- Orchestrator summarizes multi-agent work back to Ilya in plain text, not by re-emitting agent transcripts.

---

## Quick reference: when to chain

| Task | Chain |
|---|---|
| "Fix the FIFO gain calc" | `fifo-finance` → `verify-runtime` |
| "Add a column to clients" | `db-drizzle` → `rls-security` → `verify-runtime` |
| "Polish the transactions table" | `frontend-polish` → `verify-runtime` |
| "Audit this PR" | `code-reviewer` (alone) |
| "Ship iter-N" | `release-iter` (alone) |
| "Is this secure?" | `rls-security` (alone) |
| "I don't trust you — check the DB" | `verify-runtime` (alone) |
| "Write a user manual / help page" | `docs-user` (alone — writes to `/app/help/*`, adds sidebar entry) |
| "User manual needs screenshots" | `docs-user` (Playwright against demo org — NEVER real data) |
| "Help page needs hero / visual work" | `docs-user` → `frontend-polish` (layout) |
| "Update CLAUDE.md / agent files / memory" | `docs-dev` (alone) |
| "Write a deep-dive on FIFO / import / RLS" | `docs-dev` → `docs/internal/<topic>.md` (NOT web-accessible) |
| "Critique this page's UX" | `ui-ux-reviewer` (alone) |
| "Critique and then fix it" | `ui-ux-reviewer` → `frontend-polish` → `verify-runtime` |
| "Test this like a real user" / "Excel-refugee test" | `usability-tester` (alone, one round) |
| "Run the usability loop" / "make sure a real user can do this" | usability loop, bounded 3 rounds — see protocol |

If a task doesn't match a row, the orchestrator picks the closest single specialist or asks Ilya.
