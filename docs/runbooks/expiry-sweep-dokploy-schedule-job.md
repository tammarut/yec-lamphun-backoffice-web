# Runbook: Expiry Sweep Dokploy Schedule Job

Ops runbook for the **Expiry Sweep** (Annual Membership Expiry) scheduled job — create, verify, recover, change cadence. Design facts: [ADR-0027](../adr/0027-annual-membership-expiry-as-dokploy-scheduled-job.md). Wired + rehearsed in ticket #108 ([OPS-01c], parent spec #105). The Dokploy UI steps are performed by the operator; this document is the checklist they follow.

## Quick facts

| Fact | Value |
| --- | --- |
| Job type | Dokploy **Application** schedule job (docker-exec into the running app container) |
| Job name | `expiry-sweep` |
| Command | `bun annual-membership-expiry.js` |
| Dry-run (count-only, no mutation) | `bun annual-membership-expiry.js --dry-run` |
| Bundle path in image | `/app/annual-membership-expiry.js` (WORKDIR `/app`, so the bare command works; owned by the non-root `nextjs` user) |
| Final yearly cron | `1 0 1 12 *` — 00:01 UTC = 07:01 Bangkok on 1 December (same date in both zones, no shifting) |
| Timezone | Dokploy's cron timezone is undocumented — **UTC assumed**; re-verify in the UI at configuration time (the next-run preview must correspond to 00:01 UTC) |
| Runtime env | Inherits the container env (`DATABASE_URL`) and the Bun runtime — no extra secrets, no network path |
| Precondition | The target container must be running |
| Run trace | One structured LogTape JSON line per run + exit code 0/1, captured in Dokploy's job history. No marker row, no audit table |
| Idempotency | Expiry-keyed — re-running the command on **any** date is safe (see "What the job does") |

## What the job does

One atomic UPDATE over live members: `deleted_at IS NULL AND status = 'ACTIVE' AND expires_at < boundary` → `status = 'EXPIRED'`, stamping `updated_at`. The boundary is a pure function of the run date: read the Bangkok year and month, take the season year as `month === 12 ? year + 1 : year`, boundary = UTC midnight of that year's 1 January.

- **December runs** flip the ending year's members (all live `ACTIVE` holding an expiry before next 1 January).
- **Any other month** (rehearsal, recovery, a future self-healing cadence) is a ~0-row no-op on healthy data — only overdue stragglers (expiry before the *current* year's 1 January) match.
- A NULL `expires_at` is **never** matched (repo-review ruling, PR #109): a missing expiry is a legacy data anomaly to fix out-of-band.
- `PENDING_RENEWAL`, `RESIGNED`, and soft-deleted members are never matched. Committee members are expired like everyone else.

Idempotency follows from the keying: a renewed member carries next year's expiry and never matches again, so the command can be re-run for rehearsal or recovery on any date without double-expiring anyone.

## Create the job

Operator, in the Dokploy UI (docs.dokploy.com/docs/core/schedule-jobs):

1. Open the live **Application** (the backoffice web app) → Schedule Jobs → create a new job.
2. Type **Application** (docker-exec into this app's container — not a Server job).
3. Name: `expiry-sweep`.
4. Command: `bun annual-membership-expiry.js` (for a count-only rehearsal: append ` --dry-run`).
5. Cron: set the schedule (see "Rehearsal — first live firing" for the first-time sequence, otherwise the final `1 0 1 12 *`).
6. **Timezone check at configuration time:** the cron is assumed to be evaluated in UTC. Verify the UI's next-run preview against a UTC clock: for `1 0 1 12 *` the preview must correspond to 00:01 UTC (= 07:01 Bangkok, 1 December). If the preview shows a shifted local time, the host clock is not UTC — stop and record the actual offset in this runbook before trusting the fire date.
7. Save.

## Verify a run

Every execution leaves a log entry in Dokploy's job history. A healthy run shows:

- **Green status** (exit code 0), and
- **one JSON log line** with the prefix `annual membership expiry completed:` carrying exactly these fields:

| Field | Meaning | Expected on a healthy rehearsal |
| --- | --- | --- |
| `run_at` | ISO instant the run started | the firing time |
| `boundary` | the Renewal Season boundary the run date implies | `2026-01-01T00:00:00.000Z` for any 2026 run before December |
| `expired_count` | members flipped to `EXPIRED` (0 on dry-run's count) | `0` on healthy data |
| `duration_ms` | wall-clock duration of the run | tens–hundreds of ms |
| `dry_run` | whether the run was count-only | `false` for the scheduled job |

A red entry (exit code 1) carries an `error`-level line instead (`annual membership expiry failed:` / `crashed before completing:` / `aborted:` with `error_code` / `error_message`). The only CLI flag the command understands is `--dry-run`; any other argument aborts with exit 1 **without** touching the database.

## Rehearsal — first live firing (one-time, ticket #108)

Purpose: prove the wiring with one observed real firing before settling on the yearly cron. Outside December a live firing is a ~0-row no-op on healthy data, so the rehearsal is safe.

1. **Pre-flight (optional but recommended):** confirm the expected count is 0 — run against production DB:

    ```sql
    SELECT id, first_name_th, last_name_th, expires_at
    FROM members
    WHERE deleted_at IS NULL
      AND status = 'ACTIVE'
      AND expires_at IS NOT NULL
      AND expires_at < '2026-01-01T00:00:00Z'
    ORDER BY expires_at;
    ```

    Any rows returned are overdue stragglers the rehearsal will flip. List them in the ticket.
2. Create the job with a **temporary near-term cron**, e.g. `*/5 * * * *` (every 5 minutes).
3. Wait for a firing (≤ 5 min), then check job history: green run + the JSON log line (Verify a run above). `expired_count` must be `0`.
4. **If `expired_count` > 0:** the rows it flipped are overdue stragglers — list them in ticket #108 (they are not a malfunction; the predicate did exactly what ADR-0027 says) before setting the yearly cron.
5. Edit the job's cron to the final `1 0 1 12 *` (with the timezone re-check from "Create the job"). Nothing else changes — no redeploy, no code edit.

## Recover a missed or failed run

Accepted failure mode (ADR-0027): the once-a-year cron can miss if the container is mid-deploy or down at 00:01 UTC on 1 December. The practical symptom is the admin renewal picker (EXPIRED-only) coming up empty at the general meeting.

1. Dokploy → Application → container **terminal**.
2. Count-only pass first: `bun annual-membership-expiry.js --dry-run` — confirms DB reachability and shows the would-be count.
3. Live recovery: `bun annual-membership-expiry.js` — safe on **any** date (idempotent; see "What the job does"). Members who renewed after 1 December carry next-year expiries and are untouched.
4. Verify: exit 0 + the `completed:` JSON line (the terminal output is the same log line the job history captures).

A red job-history entry with `failed:` / `crashed before completing:` is usually transient (DB unreachable); re-running the command after the cause clears is the whole recovery.

## Change the cadence

Edit **only the job's cron** in the Dokploy UI — e.g. daily self-healing would be `1 0 * * *`. The boundary is recomputed from the run date on every firing, so no code change, no redeploy, and no risk of double-expiring (off-season runs only catch stragglers). Keep the timezone check in mind when re-verifying the schedule.
