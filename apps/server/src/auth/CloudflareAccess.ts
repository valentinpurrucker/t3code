// Fork patch (self-sites): a browser that Cloudflare Access authenticated gets a session cookie
// instead of the pairing screen. Only the signed Cf-Access-Jwt-Assertion is trusted, never the
// forgeable email header; anything without a valid token keeps normal pairing. See FORK.md.
import {
  AuthStandardClientScopes,
  authScopeResponse,
  type AuthSessionState,
  type ServerAuthDescriptor,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as HttpServerRequest from "effect/http/HttpServerRequest";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { ServerAuthAuthenticatedSessionIssueError } from "./EnvironmentAuth.ts";
import * as SessionStore from "./SessionStore.ts";
import { deriveAuthClientMetadata } from "./utils.ts";

export const CLOUDFLARE_ACCESS_SUBJECT = "cloudflare-access";
const JWT_HEADER = "cf-access-jwt-assertion";

export interface CloudflareAccessConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly emails: ReadonlySet<string>;
}

const readConfig = Effect.gen(function* () {
  const teamDomain = yield* Config.String("T3CODE_CLOUDFLARE_ACCESS_TEAM_DOMAIN").pipe(
    Config.option,
  );
  const audience = yield* Config.String("T3CODE_CLOUDFLARE_ACCESS_AUD").pipe(Config.option);
  const emails = yield* Config.String("T3CODE_CLOUDFLARE_ACCESS_EMAILS").pipe(
    Config.withDefault(""),
  );
  const team = Option.getOrElse(teamDomain, () => "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const aud = Option.getOrElse(audience, () => "").trim();
  if (team === "" && aud === "") return undefined;
  if (team === "" || aud === "") {
    yield* Effect.logWarning(
      "Cloudflare Access sign-in needs both T3CODE_CLOUDFLARE_ACCESS_TEAM_DOMAIN and T3CODE_CLOUDFLARE_ACCESS_AUD; it is off.",
    );
    return undefined;
  }
  return {
    issuer: `https://${team}`,
    audience: aud,
    emails: new Set(
      emails
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email !== ""),
    ),
  } satisfies CloudflareAccessConfig;
}).pipe(Effect.orElseSucceed(() => undefined));

/** The request's verified Cloudflare Access email, if any. Never fails. */
export function makeVerifier(
  config: CloudflareAccessConfig,
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`)),
) {
  return (request: HttpServerRequest.HttpServerRequest): Effect.Effect<Option.Option<string>> => {
    const token = request.headers[JWT_HEADER];
    if (typeof token !== "string" || token === "") return Effect.succeedNone;
    // A cross-site page must not mint sessions, even into the owner's own browser.
    const site = request.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin" && site !== "none") {
      return Effect.succeedNone;
    }
    return Effect.tryPromise(() =>
      jwtVerify(token, keys, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["RS256"],
      }),
    ).pipe(
      Effect.flatMap(({ payload }) => {
        // Service tokens carry no email; only people sign in this way.
        const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
        if (email === "") return Effect.succeedNone;
        if (config.emails.size > 0 && !config.emails.has(email)) {
          return Effect.logWarning("Rejected a Cloudflare Access email outside the allowlist.", {
            email,
          }).pipe(Effect.as(Option.none()));
        }
        return Effect.succeedSome(email);
      }),
      Effect.catch((cause) =>
        Effect.logWarning("Rejected a Cloudflare Access token.", { reason: String(cause) }).pipe(
          Effect.as(Option.none<string>()),
        ),
      ),
    );
  };
}

/**
 * Undefined when Cloudflare Access sign-in is not configured. Otherwise a function that issues a
 * browser session for a request Cloudflare Access authenticated, or returns undefined.
 */
export const make = Effect.gen(function* () {
  const sessions = yield* SessionStore.SessionStore;
  const config = yield* readConfig;
  if (config === undefined) return undefined;
  yield* Effect.logInfo("Cloudflare Access sign-in is on.", { issuer: config.issuer });
  const verify = makeVerifier(config);

  return Effect.fn("CloudflareAccess.signIn")(function* (
    request: HttpServerRequest.HttpServerRequest,
    auth: ServerAuthDescriptor,
  ) {
    const verified = yield* verify(request);
    if (Option.isNone(verified)) return undefined;
    const email = verified.value;
    const session = yield* sessions
      .issue({
        method: "browser-session-cookie",
        subject: CLOUDFLARE_ACCESS_SUBJECT,
        scopes: AuthStandardClientScopes,
        client: deriveAuthClientMetadata({
          request,
          presented: { label: `Cloudflare Access (${email})` },
        }),
      })
      .pipe(Effect.mapError((cause) => new ServerAuthAuthenticatedSessionIssueError({ cause })));
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      state: {
        authenticated: true,
        auth,
        ...authScopeResponse(session.scopes),
        sessionMethod: session.method,
        expiresAt: DateTime.toUtc(session.expiresAt),
      } satisfies AuthSessionState,
    };
  });
});
