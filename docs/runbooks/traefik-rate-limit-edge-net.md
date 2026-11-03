# Runbook: Traefik edge rate-limit net (SEC-1 follow-up)

**Purpose.** Drop request floods at the Traefik proxy before they wake the Next.js container. This is layer 2 of the hardening stack from spec #124 — Cloudflare (BFM + future rule) → **Traefik rateLimit (this runbook)** → app `withPublicGuard` (authoritative; PR #132). The edge net is *looser* than the app budgets (10/s vs the app's 2/s), so it only ever catches floods worse than what the app already handles. Removing this net changes nothing about the app's protection.

**Scope.** App-scoped ONLY: the middleware is defined and referenced on this app's Dokploy application labels. Other Dokploy apps and the Dokploy panel are untouched. Never configure this at the Traefik entrypoint level — that would rate-limit the panel too and could lock you out of your own deploy tooling.

---

## Step 0 — Verify-first

1. Confirm your Dokploy version exposes **Traefik custom labels** for the application (Dokploy UI → the app → Advanced / Traefik section). If the field is missing or ignored on your Dokploy build, stop and fall back to a Traefik dynamic-config file on the VPS (out of scope here; ask before going that route).
2. Find the app's existing Traefik **router name** — Dokploy generated it when the domain was attached:

   ```bash
   docker inspect <app-container> --format '{{range $k, $v := .Config.Labels}}{{$k}}={{$v}}
   {{end}}' | grep 'routers'
   ```

   You will see keys like `traefik.http.routers.<name>.rule=...`. Note `<name>` — the middleware attaches to that router.

## Step 1 — Add the labels (Dokploy UI)

Dokploy UI → the **dev** application → Advanced → Traefik custom labels. Add exactly these (one per line; `<name>` from Step 0):

```yaml
traefik.http.middlewares.yec-edge-limit.ratelimit.average=10
traefik.http.middlewares.yec-edge-limit.ratelimit.period=1s
traefik.http.middlewares.yec-edge-limit.ratelimit.burst=50
traefik.http.middlewares.yec-edge-limit.ratelimit.sourcecriterion.requestheadername=CF-Connecting-IP
traefik.http.routers.<name>.middlewares=yec-edge-limit@docker
```

Definition and reference live on the SAME container — do not cross-reference another app's middleware.

Redeploy the app from the Dokploy UI so Traefik picks up the labels.

## Step 2 — Verify

From any machine, hammer the public API through the real hostname and confirm Traefik (not the app) starts rejecting:

```bash
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code} " -H "CF-Connecting-IP: 203.0.113.99" https://<dev-host>/api/v1/business/categories
done; echo
```

Expected: mostly 200s, then `429`s once the bucket drains (100 requests > burst 50 at avg 10/s). Then confirm the app never saw the flood:

```bash
docker logs <app-container> --since 5m | grep -c "429" || echo "no app-side 429s"
```

Also sanity-check a second key (`CF-Connecting-IP: 203.0.113.98`) still gets 200s — buckets are per header value.

## Step 3 — Prod

Repeat Steps 0–2 on the **prod** application in Dokploy. Prod traffic arrives through Cloudflare, so every legitimate visitor carries the header and gets their own bucket.

---

## The one trap: never use default keying

Traefik's `rateLimit` defaults to the **connection peer address**. Behind Cloudflare, every visitor connects from a handful of CF edge IPs — default keying would put the WHOLE SITE into one shared bucket, and anyone could exhaust it with ~600 req/min. That is why `sourcecriterion.requestheadername=CF-Connecting-IP` is mandatory:

- via Cloudflare: header present per real visitor → per-visitor buckets ✓
- direct-to-origin attacker: header absent → all of them share ONE bucket → they exhaust it collectively ✓

## Known tradeoffs

- Traefik's 429 body is its own plain text, **not** our canonical `{ error_message }` JSON and has no `Retry-After`. Accepted for an edge net; every app-authored 429 keeps the canonical shape.
- `CF-Connecting-IP` is only spoofable against the edge net for direct-to-origin traffic (they'd each need the header to get separate buckets; without it they share one). The authoritative budgets (app layer) remain spoof-resistant regardless.

## Rollback

Delete the five labels in the Dokploy UI, redeploy. Two-way door; the app guard keeps protecting everything meanwhile.
