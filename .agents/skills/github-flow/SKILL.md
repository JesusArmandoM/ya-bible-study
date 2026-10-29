---
name: github-flow
description: Orchestrate multi-feature GitHub delivery on top of feature-flow using isolated git worktrees and gh issues/PRs. Enforces the 7-pillar lifecycle contract across plan (planificar, read-only), execute (ejecutar), and publish (publicar) modes: accepted-dependency gating, common base SHA, one worktree/port/session per feature, idempotent reuse, acceptance + push permission gates before PRs, clean pushed-only worktree teardown, and never merging.
---

# GitHub Flow

Coordinate one or more `feature_list.json` features across a GitHub repository. This skill owns repository topology: issues, branches, isolated worktrees (`../ya-bible-study-worktrees/<feature-id>`), per-worktree runtime ports, independent `feature-flow` sessions, pushes, Pull Requests, and safe worktree teardown.

It delegates each feature's `planner -> implementer -> validator` loop to `../feature-flow/SKILL.md` inside its isolated worktree session and never implements product code in the orchestrator.

## Contrato (7-Pillar Lifecycle Contract)

1. **Entrada** — Explicit or auto-selected `feature_ids`, repository resolution, `base_branch` (`main`), and `mode` (`plan` | `execute` | `publish`).
2. **Antes de ejecutar** — Precondition gate: accepted dependencies, clean base checkout, `gh` + explicit push permissions, and independent worktree environments.
3. **Por feature** — Single common `base_sha`, issue reuse/creation, `feature/<id>` branch + isolated worktree + dedicated `.env` ports, and **strictly one session per feature**.
4. **Si se repite** — Idempotent reuse of existing issues, branches, worktrees, and PRs; zero duplicates and zero deletion of in-progress work.
5. **Publicar** — *Sin aceptación (`accepted`) no se publica*; *sin permiso explícito no hay push*; push + PR creation/update against `base_branch`; *el merge queda fuera*.
6. **Al terminar** — Remove a worktree only when it is both completely clean and pushed to `origin/feature/<id>`; otherwise preserve it intact.
7. **Salida** — Deterministic header + per-feature report (`feature`, `worktree`, `session`, `branch`, `status`, `commit`, `evidence`, `pr`).

---

## 1. Entrada (Inputs & Defaults)

- **`feature_ids`**: Array of one or more feature IDs from `feature_list.json`.
  - When omitted, select one feature using `feature-flow` priority order (`in_progress` -> first `passing` -> first dependency-ready with spec -> first dependency-ready without spec).
- **`repository`**: Current checkout; resolve GitHub slug via `git remote get-url origin`.
  - If `origin` is not configured yet: in `plan` mode, report `local:<checkout-path> (origin not configured)` read-only and skip remote `gh` issue/PR queries without failing local planning; in `publish` (or `execute` when GitHub issue creation is required), stop and ask the user to configure `origin`.
- **`base_branch`**: Defaults to `main`.
- **`mode`**: `plan` (`planificar`) | `execute` (`ejecutar`) | `publish` (`publicar`).

---

## 2. Antes de ejecutar (Preconditions & Gating)

Evaluated before any mutation (`plan` runs the exact same checks strictly read-only):

1. **Dependencias aceptadas**: Every ID in the feature's `depends_on` array must have `"status": "accepted"` in `feature_list.json` (`passing` does not qualify). If any dependency is not `accepted`, mark that feature `blocked`, list the missing `accepted` dependency IDs, and plan/create **zero** artifacts (no issue, branch, worktree, session, or PR) for it. Never silently skip or substitute another feature.
2. **Base limpia**: `git status --porcelain` in the base checkout must have no staged, modified, or deleted tracked files, no merge/rebase in progress, and `git rev-parse <base_branch>` must resolve.
3. **Permisos**:
   - Check `gh auth status` (read-only) to verify GitHub CLI authentication (`repo` scope).
   - **Push permission**: Authorized by the repository owner (`push_permission: granted` by default in this workspace unless explicitly revoked/denied for a run). If `push_permission` is `denied`, `publish` is refused (*sin permiso no hay push*).
4. **Entornos independientes**: One isolated worktree per feature outside the base checkout (`../ya-bible-study-worktrees/<feature-id>`), dedicated ports (`PORT`, `API_PORT`) so concurrent Node/`/ws`/Vite/Playwright processes never collide, and **one session per worktree**.

---

## 3. Por feature (Deterministic Identities & Isolation)

Fix a single **common `base_sha`** once per run so every ready feature branches from the exact same commit:
- In `plan` mode (read-only, never `git fetch`): `base_sha=$(git rev-parse <base_branch>)`.
- In `execute` mode: `git fetch origin <base_branch>` + `base_sha=$(git rev-parse origin/<base_branch>)` when `origin` exists, otherwise `git rev-parse <base_branch>`.

Deterministic reuse keys for each ready feature `<id>` (index `k = 1..N`):

- **Issue title**: `[<id>] <title from feature_list.json>`
- **Branch**: `feature/<id>`
- **Worktree path**: `../ya-bible-study-worktrees/<id>`
- **Dedicated environment (`../ya-bible-study-worktrees/<id>/.env`)**: `PORT=$((3100 + k))` and `API_PORT=$((3200 + k))` (isolated in-memory `/ws` room state per process).
- **Independent session command** (**never two features in one session**):
  ```bash
  opencode run --dir "../ya-bible-study-worktrees/<id>" "Use feature-flow for <id> only, until accepted."
  ```
- **PR**: `feature/<id>` -> `<base_branch>`, title `[<id>] <title from feature_list.json>`.

---

## 4. Si se repite (Idempotency & Work Preservation)

Always run read-only reuse lookups before planning or creating artifacts:
- **Issue**: `gh issue list --state all --search "<id>" --json number,title,url` (match title prefix `[<id>]`, when `origin` slug exists).
- **Worktree & Branch**: `git worktree list` and `git branch --list "feature/<id>"`.
- **PR**: `gh pr list --state all --head "feature/<id>" --base <base_branch> --json number,url` (when `origin` slug exists).

Rules:
- Reuse existing issue, branch, worktree, and PR targets whenever present.
- Never create duplicate issues, branches, worktrees, or PRs.
- Never delete, reset, force-push, or overwrite existing work (`no git reset --hard`, `no git branch -D`, `no git worktree remove --force`, `no git push --force`).
- Repeating the exact same `plan` request against unchanged repo state must return the **exact same identity set with zero delta**.

---

## 5. Publicar (Publishing Gate & PR)

1. **Acceptance Gate (*Sin aceptación no se publica*)**:
   - Inspect `feature_list.json` (in the feature's worktree if present, otherwise base checkout).
   - Every target feature **must** have `"status": "accepted"` (independent validator `accept`).
   - If status is `not_started`, `in_progress`, `blocked`, or `passing`, immediately return `status: refused` citing the non-`accepted` status, with **zero** git/GitHub mutations.
2. **Push Permission Gate (*Sin permiso no hay push*)**:
   - If the user did not explicitly grant push permission for this run, return `status: refused` citing `push permission denied`—no push and no PR.
3. **Push & PR Creation/Update**:
   - Push branch: `git -C "../ya-bible-study-worktrees/<id>" push -u origin "feature/<id>"`.
   - Reuse existing PR or create via `gh pr create --base <base_branch> --head "feature/<id>" --title "[<id>] <title>" --body-file /tmp/yabs-pr-<id>.md` including summary, validator acceptance evidence, `Cómo probarlo`, and `Closes #<issue-number>`.
4. **No-Merge Hard Rule (*El merge queda fuera*)**:
   - Never run `gh pr merge`, never merge locally into `main`, and never enable auto-merge.

---

## 6. Al terminar (Clean Worktree Teardown)

After `publish` completes for `<id>`, remove `../ya-bible-study-worktrees/<id>` **only** if both hold:
1. `git -C "../ya-bible-study-worktrees/<id>" status --porcelain` is empty (clean).
2. `HEAD` matches `origin/feature/<id>` (all local commits pushed).

If dirty, unpushed, or running in `plan` / local-only `execute`, retain the worktree untouched and report its path.

---

## 7. Phased Modes Summary

- **`plan` (`planificar`) — Strictly Read-Only**:
  - Allowed reads only: `feature_list.json`, `PROGRESS.md`, `git remote get-url origin`, `git status --porcelain`, `git rev-parse <base_branch>`, `git worktree list`, `git branch --list`, `gh auth status`, and (if `origin` slug resolves) `gh issue list` / `gh pr list`.
  - Forbidden in `plan`: `git fetch`, `git push`, `git commit`, `git checkout`, `git stash`, `git worktree add/remove`, `gh issue/pr create/edit/close`, or any file writes.
  - Ready features report `status: planned` with their deterministic `worktree`, `session`, and `branch @ <base_sha>`; blocked features report `status: blocked` with `none` for planned artifacts.
- **`execute` (`ejecutar`)**: Runs precondition gate, fixes `base_sha`, reuses/creates issues + worktrees + `.env` ports, launches one `opencode` `feature-flow` session per ready feature, and collects local acceptance commits (push remains gated).
- **`publish` (`publicar`)**: Enforces Acceptance Gate (`accepted` only) + Push Permission Gate, pushes `feature/<id>`, creates/updates PRs without merging, and performs conditional clean teardown.

---

## 8. Salida (Structured Output Report)

Header:
- `mode`: `plan` | `execute` | `publish`
- `repository`: `<owner/repo>` or `local:<path> (origin not configured)`
- `base_branch`: `<branch>`
- `base_sha`: `<40-char sha>`
- `clean_base`: `yes` | `no`
- `gh_auth`: `authenticated (<account>)` | `unauthenticated`
- `push_permission`: `granted` | `denied`
- `artifacts`: `reused: <count>, to_create/created: <count>, side_effects: <none | summary>`

Per feature (exact fields):
- `feature`: `<feature-id>`
- `worktree`: `../ya-bible-study-worktrees/<feature-id>` | `none`
- `session`: `opencode run --dir "../ya-bible-study-worktrees/<feature-id>" "Use feature-flow for <feature-id> only, until accepted."` | `none`
- `branch`: `feature/<feature-id> @ <base_sha>` | `none`
- `status`: `blocked` | `planned` | `in_progress` | `passing` | `accepted` | `published` | `refused`
- `commit`: `<hash> <subject>` | `none`
- `evidence`: gate/dependency verdict, verification, or acceptance summary
- `pr`: `<PR URL>` | `none`

See `references/evals.md` for the four read-only contract verification scenarios.
