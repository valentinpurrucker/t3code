import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as HttpServerRequest from "effect/http/HttpServerRequest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { makeVerifier } from "./CloudflareAccess.ts";

const issuer = "https://team.cloudflareaccess.com";
const audience = "app-aud-tag";

const setup = Effect.promise(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }],
  });
  const sign = (
    claims: Record<string, unknown>,
    options: { iss?: string; aud?: string; key?: typeof privateKey } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(options.iss ?? issuer)
      .setAudience(options.aud ?? audience)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(options.key ?? privateKey);
  return { keys, sign, otherKey: other.privateKey };
});

const request = (headers: Record<string, string>) =>
  ({ headers }) as unknown as HttpServerRequest.HttpServerRequest;
const emailOf = (verified: Effect.Effect<Option.Option<string>>) =>
  verified.pipe(Effect.map(Option.getOrUndefined));

it.effect("accepts only Cloudflare-signed tokens for this app and allowed emails", () =>
  Effect.gen(function* () {
    const { keys, sign, otherKey } = yield* setup;
    const verify = makeVerifier({ issuer, audience, emails: new Set(["alice@example.com"]) }, keys);
    const token = (claims: Record<string, unknown>, options?: Parameters<typeof sign>[1]) =>
      Effect.promise(() => sign(claims, options));
    const verifyWith = (jwt: string, headers: Record<string, string> = {}) =>
      emailOf(verify(request({ "cf-access-jwt-assertion": jwt, ...headers })));

    expect(yield* verifyWith(yield* token({ email: "Alice@example.com" }))).toBe(
      "alice@example.com",
    );
    // The forgeable email header alone never signs anyone in.
    expect(
      yield* emailOf(
        verify(request({ "cf-access-authenticated-user-email": "alice@example.com" })),
      ),
    ).toBeUndefined();
    expect(yield* verifyWith(yield* token({ email: "mallory@example.com" }))).toBeUndefined();
    expect(
      yield* verifyWith(yield* token({ email: "alice@example.com" }, { aud: "another-app" })),
    ).toBeUndefined();
    expect(
      yield* verifyWith(
        yield* token({ email: "alice@example.com" }, { iss: "https://evil.cloudflareaccess.com" }),
      ),
    ).toBeUndefined();
    expect(
      yield* verifyWith(yield* token({ email: "alice@example.com" }, { key: otherKey })),
    ).toBeUndefined();
    // Service tokens have no email.
    expect(yield* verifyWith(yield* token({ common_name: "svc" }))).toBeUndefined();
    expect(
      yield* verifyWith(yield* token({ email: "alice@example.com" }), {
        "sec-fetch-site": "cross-site",
      }),
    ).toBeUndefined();
    expect(yield* verifyWith("not-a-jwt")).toBeUndefined();
  }),
);

it.effect("accepts any Cloudflare Access email when no allowlist is set", () =>
  Effect.gen(function* () {
    const { keys, sign } = yield* setup;
    const verify = makeVerifier({ issuer, audience, emails: new Set() }, keys);
    const jwt = yield* Effect.promise(() => sign({ email: "bob@example.com" }));
    expect(yield* emailOf(verify(request({ "cf-access-jwt-assertion": jwt })))).toBe(
      "bob@example.com",
    );
  }),
);
