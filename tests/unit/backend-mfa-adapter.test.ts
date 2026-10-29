import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { CookieMethodsServer, CookieOptions } from "@supabase/ssr";
import { createRequestClient } from "../../src/platform/supabase/client.ts";
import { createMfaTransport } from "../../src/modules/identity/mfa/adapter.ts";
import { performMfaOperation } from "../../src/modules/identity/mfa/service.ts";

/**
 * SDK integration with SYNTHETIC Auth/PostgREST responses, not native acceptance.
 * Uses the installed official SSR/Auth SDK and production request-client cookie
 * policy. No SDK/adapter methods are stubbed, no environment is read, and every
 * fetch is intercepted; unknown origins/routes fail the test, never hit a network.
 *
 * Fixture assumptions: Auth accepts the fixed synthetic code, verifies a factor,
 * issues AAL2 tokens, and refresh after last-factor removal issues AAL1 tokens.
 * These transitions are supplied by the fixture, not proven provider behavior.
 * HS256 getClaims exercises the SDK's remote getUser validation fallback (the
 * fixture accepts only its own issued tokens); this does not test JWKS, real JWT
 * trust, OTP cryptography, provider policy/quotas, or real browser cookie delivery.
 */
const origin = "https://supabase.mfa-fixture.invalid";
const subject = "11111111-1111-4111-8111-111111111111";
const factorId = "22222222-2222-4222-8222-222222222222";
const challengeId = "33333333-3333-4333-8333-333333333333";
const email = "synthetic-mfa@example.invalid";
const password = "synthetic-fixture-password-not-a-credential";
const acceptedCode = "012345";
const rejectedCode = "999999";
const setupSecret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';
type Aal = "aal1" | "aal2";
type CookieWrite = { name: string; value: string; options: CookieOptions };

function syntheticBackend(t: TestContext) {
  let factorStatus: "unverified" | "verified" | undefined;
  let serial = 0;
  let challengeOutstanding = false;
  const signingKey = randomBytes(32);
  const tokens = new Map<string, Aal>();
  const refreshTokens = new Map<string, Aal>();
  const requests: { method: string; path: string; aal?: Aal }[] = [];
  const unexpected: string[] = [];
  const jar = new Map<string, string>();
  const writes: CookieWrite[] = [];
  const cookies: CookieMethodsServer = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (batch) => {
      for (const cookie of batch) {
        writes.push(cookie);
        if (!cookie.value || cookie.options.maxAge === 0) jar.delete(cookie.name);
        else jar.set(cookie.name, cookie.value);
      }
    },
  };
  const user = () => ({
    id: subject,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    is_anonymous: false,
    factors: factorStatus
      ? [
          {
            id: factorId,
            factor_type: "totp",
            status: factorStatus,
            friendly_name: "Shopthie authenticator",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ]
      : [],
  });
  const session = (aal: Aal) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: `${origin}/auth/v1`,
        sub: subject,
        aud: "authenticated",
        role: "authenticated",
        email,
        aal,
        iat: now,
        exp: now + 3600,
        session_id: challengeId,
        jti: `synthetic-${++serial}`,
        is_anonymous: false,
        amr: [
          { method: "password", timestamp: now },
          ...(aal === "aal2" ? [{ method: "totp", timestamp: now }] : []),
        ],
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", signingKey)
      .update(`${header}.${payload}`)
      .digest("base64url");
    const access_token = `${header}.${payload}.${signature}`;
    const refresh_token = `synthetic-refresh-${serial}`;
    tokens.set(access_token, aal);
    refreshTokens.set(refresh_token, aal);
    return {
      access_token,
      refresh_token,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: user(),
    };
  };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" },
    });
  const fetchFixture: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = `${url.pathname}${url.search}`;
    const rejectUnknown = (): never => {
      unexpected.push(`${request.method} ${request.url}`);
      throw new Error(`Unexpected synthetic fixture request: ${request.method} ${request.url}`);
    };
    if (url.origin !== origin) return rejectUnknown();
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const aal = tokens.get(bearer);
    requests.push({ method: request.method, path, aal });
    assert.equal(request.headers.get("apikey"), "sb_publishable_synthetic_fixture_only");
    const text = await request.text();
    const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    if (request.method === "POST" && path === "/auth/v1/token?grant_type=password") {
      assert.equal(body.email, email);
      assert.equal(body.password, password);
      return json(session("aal1"));
    }
    if (request.method === "POST" && path === "/auth/v1/token?grant_type=refresh_token") {
      assert.equal(typeof body.refresh_token, "string");
      assert.ok(refreshTokens.has(body.refresh_token as string));
      return json(
        session(
          factorStatus === "verified" && refreshTokens.get(body.refresh_token as string) === "aal2"
            ? "aal2"
            : "aal1",
        ),
      );
    }
    assert.ok(aal, "Auth and PostgREST require an access token issued by this fixture");
    if (request.method === "GET" && path === "/auth/v1/user") return json(user());
    if (request.method === "POST" && path === "/rest/v1/rpc/shopthie_actor_context") {
      return json([
        {
          user_id: subject,
          role: "customer",
          status: "active",
          aal,
          mfa_required: factorStatus === "verified",
        },
      ]);
    }
    if (request.method === "POST" && path === "/auth/v1/factors") {
      assert.equal(factorStatus, undefined);
      assert.equal(body.factor_type, "totp");
      assert.equal(body.friendly_name, "Shopthie authenticator");
      factorStatus = "unverified";
      return json({
        id: factorId,
        type: "totp",
        friendly_name: "Shopthie authenticator",
        totp: {
          secret: setupSecret,
          qr_code: svg,
          uri: `otpauth://totp/synthetic-fixture?secret=${setupSecret}`,
        },
      });
    }
    if (request.method === "POST" && path === `/auth/v1/factors/${factorId}/challenge`) {
      assert.ok(factorStatus);
      assert.equal(body.factorId, factorId);
      challengeOutstanding = true;
      return json({
        id: challengeId,
        type: "totp",
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    }
    if (request.method === "POST" && path === `/auth/v1/factors/${factorId}/verify`) {
      assert.ok(challengeOutstanding);
      assert.equal(body.challenge_id, challengeId);
      challengeOutstanding = false;
      if (body.code === rejectedCode) {
        return json(
          {
            code: "mfa_verification_failed",
            msg: `fixture-private-rejection code=${rejectedCode} token=${bearer}`,
          },
          422,
        );
      }
      assert.equal(body.code, acceptedCode);
      factorStatus = "verified";
      return json(session("aal2"));
    }
    if (request.method === "DELETE" && path === `/auth/v1/factors/${factorId}`) {
      assert.equal(aal, "aal2");
      assert.equal(factorStatus, "verified");
      factorStatus = undefined;
      return json({ id: factorId });
    }
    return rejectUnknown();
  };
  t.mock.method(globalThis, "fetch", fetchFixture);
  t.after(() =>
    assert.deepEqual(unexpected, [], "all SDK requests must match explicit fixture routes"),
  );
  const client = () =>
    createRequestClient(
      {
        status: "configured",
        url: origin,
        publishableKey: "sb_publishable_synthetic_fixture_only",
        publicSignupEnabled: false,
      },
      cookies,
      "https://shop.mfa-fixture.invalid",
    );
  return { client, writes, requests, jar, tokens };
}

function form(operation: "enroll" | "verify" | "remove", code = acceptedCode) {
  const data = new FormData();
  data.set("operation", operation);
  data.set("expected_subject", subject);
  if (operation === "enroll") data.set("acknowledge_backup", "yes");
  else {
    data.set("factor_id", factorId);
    data.set("code", code);
  }
  if (operation === "remove") data.set("confirm_remove", "yes");
  return data;
}

function assertCookiePolicy(writes: CookieWrite[]) {
  assert.ok(
    writes.some(({ value }) => value.length > 0),
    "the real SDK must emit session cookies",
  );
  for (const { name, options } of writes) {
    assert.match(name, /^shopthie-auth(?:\.\d+)?$/);
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/");
  }
}

const context = (aal: Aal, status?: "unverified" | "verified") => ({
  status: "ready",
  subject,
  role: "customer",
  aal,
  factors: status ? [{ id: factorId, status }] : [],
  otherVerifiedFactor: false,
});

test("synthetic SDK roundtrip: HttpOnly signin, bound enrollment, independent AAL2 read, removal/refresh AAL1", async (t) => {
  const fixture = syntheticBackend(t);
  const signinClient = fixture.client();
  const signedIn = await signinClient.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null);
  assert.ok(signedIn.data.session);
  assertCookiePolicy(fixture.writes);
  const passwordCookies = [...fixture.jar];

  // New request: hydrate solely from the cookie jar, never pass a session/token.
  const setupClient = fixture.client();
  assert.notEqual(setupClient, signinClient);
  const setupPort = createMfaTransport(setupClient);
  assert.deepEqual(await setupPort.readContext(), context("aal1"));
  const enrollment = await performMfaOperation(setupPort, form("enroll"));
  assert.equal(enrollment.status, "enrollment");
  if (enrollment.status !== "enrollment")
    assert.fail("SDK enrollment must bind to a freshly read pending factor");
  assert.deepEqual(enrollment.context, context("aal1", "unverified"));
  assert.equal(enrollment.enrollment.factorId, factorId);
  assert.equal(enrollment.enrollment.secret, setupSecret);
  assert.equal(
    enrollment.enrollment.qrCode,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );

  const writesBeforeVerify = fixture.writes.length;
  const verified = await performMfaOperation(setupPort, form("verify"));
  assert.equal(verified.status, "success");
  assertCookiePolicy(fixture.writes.slice(writesBeforeVerify));
  assert.notDeepEqual(
    [...fixture.jar],
    passwordCookies,
    "MFA_CHALLENGE_VERIFIED must persist the promoted session",
  );
  const sdkSession = await setupClient.auth.getSession();
  assert.equal(sdkSession.error, null);
  const claims = await setupClient.auth.getClaims();
  assert.equal(claims.error, null);
  assert.equal(claims.data?.claims.aal, "aal2");

  const independentClient = fixture.client();
  assert.notEqual(independentClient, setupClient);
  const readsBefore = fixture.requests.length;
  const independentPort = createMfaTransport(independentClient);
  assert.deepEqual(await independentPort.readContext(), context("aal2", "verified"));
  const independentReads = fixture.requests.slice(readsBefore);
  assert.ok(
    independentReads.filter(({ path }) => path === "/auth/v1/user").length >= 3,
    "getClaims fallback, current getUser, and SDK listFactors each consult fixture Auth",
  );
  assert.ok(
    independentReads.some(
      ({ path, aal }) => path === "/rest/v1/rpc/shopthie_actor_context" && aal === "aal2",
    ),
  );

  const writesBeforeRemoval = fixture.writes.length;
  const removed = await performMfaOperation(independentPort, form("remove"));
  assert.equal(removed.status, "success");
  if (removed.status === "success") assert.deepEqual(removed.context, context("aal1"));
  assertCookiePolicy(fixture.writes.slice(writesBeforeRemoval));
  assert.deepEqual(await createMfaTransport(fixture.client()).readContext(), context("aal1"));
  const mutations = fixture.requests.filter(
    ({ method, path }) =>
      method === "DELETE" ||
      path.endsWith("/challenge") ||
      path.endsWith("/verify") ||
      path.includes("grant_type=refresh_token"),
  );
  assert.deepEqual(
    mutations.map(({ method, path }) => `${method} ${path}`),
    [
      `POST /auth/v1/factors/${factorId}/challenge`,
      `POST /auth/v1/factors/${factorId}/verify`,
      `POST /auth/v1/factors/${factorId}/challenge`,
      `POST /auth/v1/factors/${factorId}/verify`,
      `DELETE /auth/v1/factors/${factorId}`,
      "POST /auth/v1/token?grant_type=refresh_token",
    ],
  );
  for (const result of [verified, removed]) {
    const output = JSON.stringify(result);
    for (const sensitive of [
      acceptedCode,
      setupSecret,
      "access_token",
      "refresh_token",
      ...fixture.tokens.keys(),
    ]) {
      assert.equal(
        output.includes(sensitive),
        false,
        "non-enrollment action state must not expose credentials",
      );
    }
  }
});

test("synthetic SDK OTP rejection is sanitized and cannot promote cookie-backed assurance", async (t) => {
  const fixture = syntheticBackend(t);
  const client = fixture.client();
  assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
  const port = createMfaTransport(client);
  assert.equal((await performMfaOperation(port, form("enroll"))).status, "enrollment");
  const before = [...fixture.jar];
  const denied = await performMfaOperation(port, form("verify", rejectedCode));
  assert.deepEqual(denied, {
    status: "error",
    message: "The code could not be verified. Enter a fresh code and try again.",
  });
  assert.deepEqual([...fixture.jar], before, "rejected OTP must not write an AAL2 session");
  assert.deepEqual(
    await createMfaTransport(fixture.client()).readContext(),
    context("aal1", "unverified"),
  );
  const output = JSON.stringify(denied);
  for (const sensitive of [
    rejectedCode,
    setupSecret,
    "fixture-private-rejection",
    "mfa_verification_failed",
    ...fixture.tokens.keys(),
  ]) {
    assert.equal(
      output.includes(sensitive),
      false,
      "provider failure details must stay out of action state",
    );
  }
  assert.equal(fixture.requests.filter(({ path }) => path.endsWith("/challenge")).length, 1);
  assert.equal(fixture.requests.filter(({ path }) => path.endsWith("/verify")).length, 1);
  assert.equal(
    fixture.requests.some(
      ({ method, path }) => method === "DELETE" || path.includes("grant_type=refresh_token"),
    ),
    false,
  );
});
