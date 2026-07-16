# CD: publish Docker image to GHCR, gated on CI success

Docker images for this app are built by GitHub Actions (not the production host), pushed to the GitHub Container Registry (GHCR), and pulled by Dokploy on the Contabo VPS. CD is a separate workflow file (`cd.yml`) that runs only after the CI workflow (`ci.yml`) completes successfully.

## Scope: this is delivery, not deployment

`cd.yml` **builds and publishes an image** — it does not deploy. The workflow's responsibility ends when the image is in the registry. **Deployment is Dokploy's job:** Dokploy pulls the `:main` tag from GHCR and restarts the container. Whether Dokploy pulls automatically (via a webhook on GHCR push) or requires a manual trigger is configured in Dokploy, not in this repo.

This makes the workflow continuous *delivery* (an artifact is always ready to deploy) rather than continuous *deployment* (production is automatically updated). The boundary is deliberate: Dokploy owns the runtime environment (env vars, networking, process lifecycle), so it is the correct place to own the deploy decision. If automatic deployment is later desired, the change is a Dokploy webhook configuration — not a modification to `cd.yml`.

## Why

The Contabo VPS running Dokploy previously built the Docker image from source on every push. `docker build` of a Next.js app is the single most resource-intensive operation in the lifecycle, and the VPS is RAM-constrained. Build spikes risked instability and starved the running app of memory. Offloading the build to GitHub Actions' free runners moves that compute entirely off the VPS; Dokploy's only job becomes a lightweight `docker pull` + container restart.

## Considered options

- **GHCR via GitHub Actions, Dokploy pulls prebuilt image (chosen).** Build compute moves to GitHub. VPS does a fast pull. Uses the existing committed multi-stage `Dockerfile` unchanged. GHCR is free for the project's scale and tied to the existing GitHub account.
- **Continue building on the VPS (status quo).** Rejected: the RAM spikes are the problem being solved.
- **Vercel (native Next.js hosting).** Rejected for this project: the operator runs Dokploy on a self-managed VPS and wants to keep the deployment topology. The container image is the unit of deployment.

## How CI gates CD

`cd.yml` uses the `workflow_run` trigger, not `push`:

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
```

The `build-and-push` job then checks `if: github.event.workflow_run.conclusion == "success"`. This guarantees no image is published from a commit that failed lint, tests, or build. The two workflow files stay decoupled — re-running CI does not re-publish, and CD never races ahead of CI.

### Why `workflow_run` and not a single merged workflow with `needs:`

The operator explicitly wanted CI and CD in separate files (different audiences, different failure modes). `workflow_run` is the only built-in primitive that enforces a cross-file success dependency. The cost is a known subtlety, documented below.

### Subtlety: `workflow_run` uses the default branch's workflow file

GitHub always runs the `cd.yml` definition from the **default branch** (`main`), even when the trigger originated from another branch. For this project CD only fires after CI runs on a `main` push (not from PR branches), so the running `cd.yml` is always the one on `main` — the intended version. The implication worth remembering: edits to `cd.yml` on a feature branch are **not exercised until that branch merges to main**. There is no way to test a `workflow_run`-triggered CD change from a PR alone; validate via `act -l` (job listing) and YAML lint locally, then confirm on the first post-merge run.

## Tagging

Images are tagged by `docker/metadata-action@v6`:

- `type=ref,event=branch` → the branch name. Push to `main` produces `ghcr.io/<owner>/<repo>:main`. **This is the tag Dokploy pulls** — it is mutable and always points at the latest successful-CI build of `main`.
- `type=semver,pattern={{version}}` → a git tag `v1.2.3` produces image tag `1.2.3`. Immutable, enables pinning and rollback to a known-good version.

The blog template's additional `prod` overlay tag was dropped: with only a `main`-deployed flow, `prod` would be indistinguishable from `:main` and adds a tag without adding information.

The checkout step pins to `github.event.workflow_run.head_sha` — the **exact commit CI verified** — so a fast-forward on `main` between CI start and CD run cannot cause CD to build a different commit than the one CI blessed.

## GHCR authentication

Pushing to GHCR requires an explicit `docker/login-action` step before `build-push-action`. The `GITHUB_TOKEN` is automatically available in every workflow run and already granted `packages: write` via the top-level `permissions:` block, but `build-push-action` does not authenticate on its own — without the login step the push fails with `unauthorized: unauthenticated: User cannot be authenticated with the token provided.` The login step uses `github.actor` (the user who triggered the run) as the username and `secrets.GITHUB_TOKEN` as the password, authenticating against `ghcr.io`.

## Cleanup

Old image versions are pruned by `dataaxiom/ghcr-cleanup-action`, SHA-pinned to commit `d52806a0dc70b430571a37da1fde39733ffd640f` (tag `v1.2.2`). Configuration: `keep-n-tagged: 3` (keep the 3 newest tagged images), `delete-untagged: true` (remove images with no tag), and `exclude-tags: '^v?\d+\.\d+\.\d+$'` with `use-regex: true` (never delete semver releases like `1.2.3` or `v1.2.3`, regardless of age).

### Note on input names (API drift)

The blog template that inspired this workflow used `keep-latest` and `keep-tags`, which were inputs in older versions of the action. The pinned version (`v1.2.2`) renamed these: `keep-latest` → `keep-n-tagged`, and `keep-tags` → `exclude-tags`. Additionally, the old `keep-tags` interpreted its value as regex implicitly; the new `exclude-tags` requires `use-regex: true` to be set explicitly, otherwise the value is treated as a wildcard glob and the regex `^v?\d+\.\d+\.\d+$` would not match as intended. When bumping the pinned SHA in future, re-check the action's `action.yml` for further input renames.

### Why SHA-pinned, not `@v1`

The cleanup action holds `packages: write` scope — it can **delete** package versions. A floating tag (`@v1`) could be moved to a compromised release by anyone with push access to the upstream action, and that release would then run with destructive scope against this repo's packages. SHA-pinning makes the version immutable; bumping is a deliberate, reviewable change. GitHub's own security guidance recommends pinning actions to a full commit SHA for exactly this reason. Bumping means resolving the new tag's SHA (via `gh api` or the GitHub UI) and replacing the SHA in `cd.yml`.

## Consequences

- **GHCR package ACL (one-time, GitHub UI):** the workflow's `permissions: packages: write` grants the `GITHUB_TOKEN` the *capability* to write packages, but GHCR enforces a separate per-package allowlist deciding *which repos' tokens may touch a given package*. For **user-owned** packages (this repo is owned by the user `tammarut`, not an org), GitHub does **not** auto-grant the source repo access on package creation — the first CD push fails with `permission_denied: write_package` even though the token is correctly authenticated (via the login step) and scoped. The fix is a one-time manual step in the package settings: `github.com/users/<owner>/packages/container/<package>/settings` → "Manage Actions access" → add the `yec-lamphun-backoffice-web` repository with **Write** role. Org-owned packages auto-grant this; the gotcha is specific to user-owned packages. Once granted, re-run the failed CD workflow and the push succeeds.
- **Dokploy config change (outside this repo):** the Dokploy application must switch from "build from GitHub source" to "pull image `ghcr.io/<owner>/<repo>:main`." This is a Dokploy UI/config change, not something the workflow does.
- **GHCR package visibility:** the first push creates the package as private by default. Visibility (public vs private) is a separate decision made in the GitHub package settings. The image is built with `SKIP_ENV_VALIDATION=true`, so no secrets are baked in — all real env vars (`DATABASE_URL`, `R2_*`, `ADMIN_*`) are injected by Dokploy at container start.
- **First-run bootstrap:** the package does not exist in GHCR until the first successful CI→CD cycle on `main` completes. Dokploy cannot pull `:main` until then; the first deploy after merging this workflow must complete the full cycle before Dokploy can switch to image-pull mode.
- **Manual cleanup fallback:** if the cleanup action ever misbehaves, images can be pruned via `gh api` or the GitHub UI's package version management.
- **No multi-arch build:** the image builds for the GitHub runner's native architecture (amd64). If the Contabo VPS is a different architecture (e.g. arm64), the image will fail to run and `docker/setup-qemu-action` + a `platforms` matrix will be needed. Confirm the VPS architecture before the first production deploy.
