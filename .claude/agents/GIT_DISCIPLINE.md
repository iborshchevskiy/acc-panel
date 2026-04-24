# AccPanel Git Discipline

Every agent that modifies code follows this. No exceptions. The orchestrator enforces; each agent self-enforces in its own Report contract.

The model is straightforward: `main` is production, Vercel auto-deploys from `main`. Feature branches are where work happens. Nothing reaches `main` without Ilya's explicit go-ahead.

---

## The rules

### Branching

- **Never commit to `main` or `dev` directly.** Every change lives on a feature branch.
- **Branch naming:** `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`, `test/<slug>`. Keep slugs short and descriptive — `feat/help-center`, `fix/fifo-short-rate-zero`, not `feat/my-changes`.
- **Branch from `main`** for most work. Branch from `dev` only if Ilya is running a multi-feature integration and has said so.
- **One branch per concern.** If the work fans out into an unrelated area, open a second branch — don't let a PR sprawl.
- **Check what branch you're on before you edit anything.** If it's `main` or `dev`, stop and create a feature branch. If it's someone else's in-progress branch, ask Ilya.

### Commits

- **Small and atomic.** One logical change per commit. If the commit message needs "and also", split it.
- **Commit as you go.** After each logical unit (a passing test, a working component, a reviewed migration), commit. Don't batch a whole day's work into one giant commit.
- **Conventional Commits style** — matches the repo's history:
  - `feat(scope): subject` for new user-visible behavior
  - `fix(scope): subject` for bugs
  - `refactor(scope): subject` for non-behavior-changing restructure
  - `test(scope): subject` for tests
  - `chore(scope): subject` for tooling, deps, etc.
  - `docs(scope): subject` for docs and comments
  - Subject in lowercase, no trailing period, imperative mood (`add`, `fix`, `remove`), under 72 chars.
  - Body only when the *why* isn't in the subject. Wrap at 72.
- **Do NOT add `Co-Authored-By` lines.** The repo's existing commits don't have them — don't start now. The system prompt's default is overridden by the repo's actual style.
- **Stage specific files.** `git add <path>` with explicit paths. Not `git add -A` or `git add .` — they pull in secrets, build artefacts, or unrelated work-in-progress.
- **Pre-commit hooks must pass.** Never `--no-verify`. If a hook fails, the commit did NOT happen — fix the cause and make a NEW commit. Never `--amend` to paper over hook failures; you'd mutate a commit that isn't yours.

### Pushing

- `git push -u origin <branch>` on the first push to set upstream.
- Never force-push (`--force` / `-f`) to any shared branch. Never force-push to `main` under any circumstance. `--force-with-lease` is allowed on your own feature branch when rewriting local history *that has not yet been reviewed*.
- Push often enough that work isn't stuck on one laptop; not so often that you flood CI. After each meaningful commit is usually right.

### Pull requests & merging to main

- **Open a PR to `main`** when the branch is ready for review. Use `gh pr create`.
- **PR title** = the most important commit's subject, under 70 chars.
- **PR body** = short summary (1–3 bullets) + test plan checklist. Don't copy every commit message — the commit log already exists.
- **CI must be green** before merge. Every CI check. No overrides.
- **`main` merge requires Ilya's explicit go-ahead.** No agent merges to `main` on its own judgment, regardless of how green the checks are.
- **Merge strategy:** default to a merge commit (`gh pr merge --merge`) so each feature stays identifiable in history. Squash only for branches with churn-heavy WIP commits, and only when Ilya asks.
- **Delete the branch after merge** (`gh pr merge --delete-branch` or `git push origin --delete <branch>` + local prune). Stale branches are noise.

### Deploys

- **`main` auto-deploys to Vercel (production).** Every merge to `main` is a production deploy. Act accordingly — no half-finished work, no feature flags left hanging, no console.log dumps.
- **Preview deployments** happen automatically for every PR. Use them to verify before merge.
- **`release-iter` owns the final merge step.** Other agents do not merge to `main` — they stop at "branch ready, PR open, CI green" and hand off.

### Destructive operations

Never run any of these without Ilya's explicit approval in the same conversation:

- `git reset --hard`
- `git checkout --` on modified files
- `git clean -f` / `git clean -fd`
- `git branch -D` on a branch that has any unique commits
- `git push --force` / `git push -f`
- `git rebase -i` (interactive flag not supported in agent mode anyway)
- `git commit --amend` on anything already pushed

When in doubt, stash (`git stash push -m "<reason>"`) and ask.

### Never touch these

- **`.git/config`** — never run `git config` with `--global` or repo-level writes without Ilya's approval.
- **`.vercel/`** directory — project-linking config, touch via `vercel` CLI only.
- **`.env.local`** — never commit. It's in `.gitignore`; if it appears in `git status` under tracked changes, that's a bug.
- **Hook bypass flags** — `--no-verify`, `--no-gpg-sign`. Never.

### Working with someone else's uncommitted changes

If `git status` shows modified files you didn't touch:

1. **Stop.** Those belong to Ilya or a previous session.
2. Don't stage, commit, or overwrite them.
3. Ask Ilya what branch your work should live on, or offer to `git stash push` with a clear message so the work is preserved and you can proceed on a clean tree.

---

## The agent checklist — run this every time you edit code

Before editing:
1. `git status` — is the tree clean?
2. `git rev-parse --abbrev-ref HEAD` — am I on a feature branch?
3. If on `main` / `dev` / someone else's branch → create a feature branch first.

While editing:
4. After each logical unit, commit with a conventional-commit subject.
5. Don't let uncommitted work pile up across unrelated concerns.

Before reporting `DONE`:
6. `git status` is clean (or intentionally has uncommitted WIP documented in the report).
7. Your commits pushed (if the branch existed before) or you've noted "not pushed yet — awaiting Ilya's approval".
8. The report names the branch and the commits made.

---

## Report contract addition (for code-editing agents)

When you `DONE:` a code task, the report names:
- The branch you worked on
- The commits you made (short hash + subject)
- Whether they were pushed
- Whether a PR is open

Example:
```
DONE: fixed fifo short-rate guard | branch: fix/fifo-short-rate-zero
  commits: a1b2c3d fix(fifo): guard spurious disposal when proceedsRate=0
  pushed: yes
  PR: not yet — needs Ilya's go-ahead to open against main
```

If you did not commit, say so explicitly and why:
```
DONE: prototype wired up | branch: feat/help-center
  commits: none — draft only, awaiting Ilya's review before committing
```
