# self-sites fork of T3 Code

This fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) serves
self-sites, a self-hosted setup that gives each person their own T3 Code behind Cloudflare. Branch `self-sites` (the default)
is upstream `main` plus the patches below; `main` mirrors upstream. Only the Linux x64 CLI and the
web UI matter here. Desktop, mobile, and the other platforms are neither built nor translated.

Search for `Fork patch (self-sites)` to find every patched spot.

## Patches

**Cloudflare Access sign-in** (`apps/server/src/auth/CloudflareAccess.ts`, a hook in the
`session` handler of `apps/server/src/auth/http.ts`). When Cloudflare Access protects the
server's hostname, a browser it authenticated gets an ordinary browser session cookie on its first
`GET /api/auth/session`. It never sees the pairing screen. The web client needs no change, because
it already skips pairing when that call answers `authenticated`.

- Only the signed `Cf-Access-Jwt-Assertion` header counts. It is verified against
  `https://<team>/cdn-cgi/access/certs` for issuer, audience, RS256, and expiry. The plain
  `Cf-Access-Authenticated-User-Email` header is ignored. The port is reachable without passing
  Cloudflare (LAN, other local users, Docker containers on the host), so that header could be
  forged.
- Cross-site requests (`Sec-Fetch-Site` other than `same-origin`/`none`) and service tokens (no
  `email` claim) never sign in.
- Requests without a valid token fall through to normal pairing. The desktop and mobile apps
  still pair through T3 Connect.
- The session has subject `cloudflare-access`, standard client scopes, and the label
  `Cloudflare Access (<email>)`. It appears in Settings → Access and can be revoked there.

Configuration (environment, e.g. `~/.t3/service.env`; both of the first two turn it on):

| Variable                               | Value                                       |
| -------------------------------------- | ------------------------------------------- |
| `T3CODE_CLOUDFLARE_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com`               |
| `T3CODE_CLOUDFLARE_ACCESS_AUD`         | the Access application's audience (AUD) tag |
| `T3CODE_CLOUDFLARE_ACCESS_EMAILS`      | optional comma-separated allowlist          |

**Releases from the fork** (`packages/shared/src/cliRelease.ts`, `scripts/install.sh`). Runtime
downloads, `t3 update`, and the background service's self-update read this fork's GitHub
releases. An upstream version offered by another client therefore fails to download instead of
replacing the fork. Install with:

```sh
curl -fsSL https://raw.githubusercontent.com/valentinpurrucker/t3code/self-sites/scripts/install.sh | sh
```

**German UI** (`apps/web/src/i18n/`). `t("English text", { name })` and
`tn(count, "{count} file", "{count} files")`. The English text is the key and the fallback.
Catalogs are `apps/web/src/i18n/de/<module>.json`, one flat `{ "English": "Deutsch" }` file per
UI module, so modules can be translated independently. They load eagerly, so `t()` also works in
module-level constants. The language setting (Settings → Appearance → Language; default: the
browser's language) is stored per browser in `localStorage["t3code:locale"]`, and changing it
reloads the page.

## Releasing

Every upstream workflow is disabled in this fork (`gh workflow disable`). Otherwise
`release.yml` would also fire on this fork's release tags. Only `.github/workflows/fork-release.yml`
runs:

```sh
gh workflow run fork-release.yml -R valentinpurrucker/t3code --ref self-sites
```

It typechecks the server and web, runs the fork's tests, and builds and smoke-tests
`t3-<version>-linux-x64.tar.gz`. It then publishes a release with `SHA256SUMS`, marked latest.
Versions are `<server version>-selfsites.<YYYYMMDD>.<run>`, so they never collide with an upstream
runtime cached in `~/.t3/runtime/versions`.

## Updating from upstream

```sh
git fetch upstream && git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout self-sites && git rebase main   # resolve conflicts, mostly in wrapped UI strings
git push --force-with-lease origin self-sites
```

New upstream UI text stays English until someone wraps it and adds it to the module's catalog.
After a rebase, re-run `gh workflow disable` for any newly added upstream workflow.
