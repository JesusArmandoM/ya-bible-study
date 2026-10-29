# github-flow Contract Evals (YA Bible Study)

Read-only contract evals for `../SKILL.md` against this repository's `feature_list.json`. Every run executes strictly without side effects: zero git mutations, zero GitHub mutations, and zero file writes. Publish gating in Eval 4 exercises the read-only acceptance & push gates directly.

## Common Inputs

- `repository`: `/Users/armando/Documents/YA Bible Study` (resolved via `git remote get-url origin` when configured, or `local:/Users/armando/Documents/YA Bible Study (origin not configured)`).
- `base_branch`: `main` (where `app-shell-single-port-bootstrap` has `"status": "accepted"`).
- `push_permission`: `denied` (default when not explicitly granted).
- Feature source: `feature_list.json` as it stands at eval time.
- Allowed reads only: `feature_list.json`, `PROGRESS.md`, `git remote get-url origin`, `git status --porcelain`, `git rev-parse main`, `git worktree list`, `git branch --list`, `gh auth status`, and (if `origin` exists) `gh issue list`, `gh pr list`.

Record per eval: verdict `pass` / `fail`, observed structured report lines, and before/after zero-side-effect check.

---

## Eval 1 — Blocked feature: missing accepted dependency

- **Input**: `mode = "plan"`, `feature_ids = ["markdown-study-deterministic-parser"]`.
- **Repo state**: `markdown-study-deterministic-parser` declares `depends_on: ["preloaded-great-is-your-faith-seed"]`, whose status in `feature_list.json` is `"not_started"` (not `"accepted"`).
- **Expected**: `status: blocked` — missing accepted dependency `preloaded-great-is-your-faith-seed`. No issue, worktree, branch, session, or PR is planned (`worktree: none`, `session: none`, `branch: none`, `pr: none`, `to_create: 0`). Zero side effects.
- **Pass criteria**: Report names both `markdown-study-deterministic-parser` and `preloaded-great-is-your-faith-seed`, states the dependency is not `accepted`, plans `0` artifacts, and leaves git/filesystem state untouched.

---

## Eval 2 — Two ready features, one common base SHA, two independent worktrees & sessions

- **Input**: `mode = "plan"`, `feature_ids = ["preloaded-great-is-your-faith-seed", "ws-live-session-room-lifecycle"]`.
- **Repo state**: Both `preloaded-great-is-your-faith-seed` and `ws-live-session-room-lifecycle` declare `depends_on: ["app-shell-single-port-bootstrap"]`, whose status in `feature_list.json` is `"accepted"`.
- **Expected**: Both features report `status: planned`; one identical `base_sha` (`git rev-parse main`) is shared by both; two distinct worktrees (`../ya-bible-study-worktrees/preloaded-great-is-your-faith-seed` and `../ya-bible-study-worktrees/ws-live-session-room-lifecycle`) and two distinct `opencode run --dir ...` session commands (never two features in one session); per feature includes `worktree`, `session`, `branch`, `status`, `commit`, `evidence`, and `pr`. Zero side effects.
- **Pass criteria**: Both features report `status: planned`; `base_sha` is identical; worktree paths differ; session commands are separate single-feature invocations; zero side effects.

---

## Eval 3 — Repeated request is idempotent

- **Input**: Exact same request as Eval 2 (`mode = "plan"`, `feature_ids = ["preloaded-great-is-your-faith-seed", "ws-live-session-room-lifecycle"]`), issued a second time.
- **Expected**: Identical plan output — same `base_sha`, worktree paths, `feature/<id>` branches, issue/PR lookup targets, and `opencode run --dir ...` session commands — with an empty delta (`0` duplicate artifacts, `0` deletions) relative to Eval 2. Zero side effects.
- **Pass criteria**: Run 2 identity set equals Run 1 identity set byte-for-byte; zero additional or duplicate artifacts planned; zero side effects.

---

## Eval 4 — Publish without acceptance is refused

- **Input**: `mode = "publish"`, `feature_ids = ["preloaded-great-is-your-faith-seed"]` (`status: "not_started"` in `feature_list.json`), evaluated read-only through the publishing gate.
- **Expected**: `status: refused` — *sin aceptación no se publica* (`preloaded-great-is-your-faith-seed` has status `not_started`, not `accepted`; additionally `push_permission: denied`). Zero push, zero PR, zero issue/worktree/branch/file mutations.
- **Pass criteria**: Verdict `status: refused` explicitly citing that status is not `accepted`; `to_create: 0`; zero side effects.
