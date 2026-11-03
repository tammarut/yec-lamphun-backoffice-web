# Runbook: Traefik edge rate-limit net (SEC-1 follow-up)

**Purpose.** Drop request floods at the Traefik proxy before they wake the Next.js container. This is layer 2 of the hardening stack from spec #124 — Cloudflare (BFM + future rule) → **Traefik rateLimit (this runbook)** → app `withPublicGuard` (authoritative; PR #132). The edge net is *looser* than the app budgets (10/s vs the app's 2/s), so it only ever catches floods worse than what the app already handles. Removing this net changes nothing about the app's protection.

**Scope.** App-scoped ONLY: the middleware is defined and referenced inside this app's own Traefik config (Dokploy UI → the app → Advanced / Traefik section, a file-provider dynamic config). Other Dokploy apps and the Dokploy panel are untouched. Never configure this at the Traefik entrypoint level — that would rate-limit the panel too and could lock you out of your own deploy tooling.

*Verified against the real dev config 2026-11-03: Dokploy exposes a YAML dynamic config (routers/services per domain), not labels — hence the `@file` reference below.*

---

## Step 0 — Verify-first

1. **Orange-cloud check (the keying depends on it):** the hostname must be proxied through Cloudflare. If the DNS record is DNS-only (grey cloud), visitors send no `CF-Connecting-IP` → ALL traffic shares ONE bucket → legit traffic throttled at 10/s shared. Check the cloud icon next to the DNS record in the Cloudflare dashboard, or `curl -sI https://<host> | grep -i cf-ray` (hit = proxied).
2. Open the app's Traefik config (Dokploy UI → the app → Advanced / Traefik) and note the **websecure router's name** — the middleware attaches to that router (the `web` router only redirects to HTTPS; skip it).

## Step 1 — Wire the middleware into the dynamic config (Dokploy UI)

Dokploy UI → the **dev** application → Advanced / Traefik. Edit the YAML:

1. Add a top-level `http.middlewares` block defining `yec-edge-limit`:

   ```yaml
   http:
     middlewares:
       yec-edge-limit:
         rateLimit:
           average: 10
           period: 1s
           burst: 50
           sourceCriterion:
             requestHeaderName: CF-Connecting-IP
   ```

2. On the **websecure** router, replace `middlewares: []` with:

   ```yaml
   middlewares:
     - yec-edge-limit@file
   ```

The `@file` suffix matches the file-provider config Dokploy manages (a label-based setup would reference `yec-edge-limit@docker` instead). Definition and reference live in the SAME app's config — do not cross-reference another app's middleware.

Save, then redeploy the app from the Dokploy UI so Traefik reloads the config.

## Step 2 — Verify

Two ground rules learned from the first live verification (2026-11-03):

- **Never send `CF-Connecting-IP` from the client.** Cloudflare 403s any inbound request carrying that header (spoof guard, `error code: 1000`-style body). Through a real proxied path CF stamps the header itself with your real IP — just send plain requests.
- **Sequential curl can't outrun the edge net.** At ~3–5 req/s round-trip pace, the 10/s refill never drains; only the app's tighter 120/min budget trips (that's the design — edge looser than app). To exercise Traefik you must go parallel.

The app budget (2/s) trips before the edge net (10/s) at normal pace — expect app-authored 429s there. Then hammer parallel to exceed 10/s and confirm the edge net:

```bash
# 1. Who answers the 429s under parallel load?
seq 1 150 | xargs -P 20 -I{} curl -s \
  "https://<dev-host>/api/v1/business/categories" | sort | uniq -c

# Expected mix:
#   {"error_message":"Too Many Requests"}  <- app guard (the first wave)
#   429 Too Many Requests (plain text)     <- Traefik edge net (burst drained)

# 2. Status histogram
seq 1 150 | xargs -P 20 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<dev-host>/api/v1/business/categories" | sort | uniq -c
```

Then confirm the flood never reached Node: the app's structured warn lines (`Rate limit tripped`) stop appearing once Traefik's plain-text 429s take over:

```bash
docker logs <app-container> --since 5m | grep -c "Rate limit tripped"
```

## Step 3 — Prod

Repeat Steps 0–2 on the **prod** application in Dokploy. Prod traffic arrives through Cloudflare, so every legitimate visitor carries the header and gets their own bucket.

---

## The one trap: never use default keying

Traefik's `rateLimit` defaults to the **connection peer address**. Behind Cloudflare, every visitor connects from a handful of CF edge IPs — default keying would put the WHOLE SITE into one shared bucket, and anyone could exhaust it with ~600 req/min. That is why `sourceCriterion.requestHeaderName: CF-Connecting-IP` is mandatory:

- via Cloudflare: header present per real visitor → per-visitor buckets ✓
- direct-to-origin attacker: header absent → all of them share ONE bucket → they exhaust it collectively ✓

## Known tradeoffs

- Traefik's 429 body is its own plain text, **not** our canonical `{ error_message }` JSON and has no `Retry-After`. Accepted for an edge net; every app-authored 429 keeps the canonical shape.
- `CF-Connecting-IP` is only spoofable against the edge net for direct-to-origin traffic (they'd each need the header to get separate buckets; without it they share one). The authoritative budgets (app layer) remain spoof-resistant regardless.

## Rollback

In the app's Traefik config, revert the websecure router's `middlewares` to `[]` and delete the `http.middlewares` block, then redeploy. Two-way door; the app guard keeps protecting everything meanwhile.
