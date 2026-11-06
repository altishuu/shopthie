"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { OwnerSetupActionResult, OwnerSetupPageState } from "../types";
import { decodeOwnerSetupState } from "../policy";

const unavailable =
  "Owner setup is unavailable. Reload this page or explicitly refresh setup status before another request.";

function record(
  value: unknown,
  required: string[],
  optional: string[] = [],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    required.every((key) => Object.hasOwn(descriptors, key)) &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === "string" &&
        (required.includes(key) || optional.includes(key)) &&
        Object.hasOwn(descriptors[key], "value"),
    )
  );
}
function decode(value: unknown): OwnerSetupPageState | null {
  if (
    record(value, ["status"], ["message"]) &&
    (value.status === "guest" || value.status === "unavailable") &&
    (!Object.hasOwn(value, "message") || typeof value.message === "string")
  )
    return { status: value.status };
  if (
    !record(value, ["status", "subject", "phase", "designation"], ["intent"]) ||
    value.status !== "ready" ||
    typeof value.subject !== "string"
  )
    return null;
  const decoded = decodeOwnerSetupState(
    {
      subject: value.subject,
      status: value.phase,
      designation: value.designation,
      ...(Object.hasOwn(value, "intent") ? { intent: value.intent } : {}),
    },
    value.subject,
  );
  return decoded?.status === "ready" ? decoded : null;
}

export function OwnerSetupManager({
  initial,
  checkAction,
  verifyAction,
  consentAction,
}: {
  initial: OwnerSetupPageState;
  checkAction: () => Promise<OwnerSetupPageState>;
  verifyAction: (form: FormData) => Promise<OwnerSetupActionResult>;
  consentAction: (form: FormData) => Promise<OwnerSetupActionResult>;
}) {
  const bound = decode(initial);
  const subject = bound?.status === "ready" ? bound.subject : null;
  const designation = bound?.status === "ready" ? bound.designation : null;
  const identity = `${subject}:${designation}`;
  const [state, setState] = useState<OwnerSetupPageState | null>(null);
  const [stateIdentity, setStateIdentity] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const requestForm = useRef<FormData | null>(null);
  const current = stateIdentity === identity && state?.status === "ready" ? state : null;
  const refresh = useRef<() => Promise<void>>(async () => {});

  function invalidate() {
    generation.current++;
    inFlight.current = false;
    requestForm.current?.delete("code");
    requestForm.current?.delete("confirm");
    requestForm.current = null;
    setState(null);
    setStateIdentity(null);
    setCode("");
    setConfirmed(false);
    setMessage("");
    setPending(false);
  }
  function matches(value: OwnerSetupPageState | null) {
    return (
      value?.status === "ready" &&
      subject !== null &&
      value.subject === subject &&
      value.designation === designation
    );
  }
  useLayoutEffect(() => {
    mounted.current = true;
    async function revalidate() {
      invalidate();
      const token = generation.current;
      inFlight.current = true;
      setPending(true);
      try {
        const value = decode(await checkAction());
        if (!mounted.current || token !== generation.current) return;
        if (matches(value)) {
          setState(value);
          setStateIdentity(identity);
        } else setMessage(unavailable);
      } catch {
        if (mounted.current && token === generation.current) setMessage(unavailable);
      } finally {
        if (mounted.current && token === generation.current) {
          inFlight.current = false;
          setPending(false);
        }
      }
    }
    refresh.current = revalidate;
    // Initial setup / StrictMode / Activity renew only the read-only self capability.
    void revalidate();
    const hide = () => {
      flushSync(invalidate);
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", hide);
    window.addEventListener("storage", hide);
    window.addEventListener("focus", hide);
    const visibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      invalidate();
      refresh.current = async () => {};
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", hide);
      window.removeEventListener("storage", hide);
      window.removeEventListener("focus", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
    // Binding changes invalidate all prior capability, inputs and late responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, designation, checkAction]);

  async function submit(kind: "verify" | "consent") {
    if (
      !mounted.current ||
      inFlight.current ||
      !current ||
      (kind === "verify"
        ? current.phase !== "mfa_required" || !/^[0-9]{6}(?![\s\S])/.test(code)
        : current.phase !== "ready" || !confirmed || !designation)
    )
      return;
    const form = new FormData();
    form.set("subject", current.subject);
    if (kind === "verify") form.set("code", code);
    else {
      form.set("designation", designation!);
      form.set("confirm", "yes");
    }
    const token = ++generation.current;
    requestForm.current = form;
    inFlight.current = true;
    setCode("");
    setConfirmed(false);
    setMessage("");
    setPending(true);
    function fail() {
      invalidate();
      setMessage(unavailable);
    }
    try {
      const result: unknown = await (kind === "verify" ? verifyAction(form) : consentAction(form));
      if (!mounted.current || token !== generation.current) return;
      if (
        !record(result, ["status", "message"], ["reloadRequired", "state"]) ||
        typeof result.message !== "string" ||
        result.status !== "success" ||
        (Object.hasOwn(result, "reloadRequired") && result.reloadRequired !== false)
      ) {
        fail();
        return;
      }
      const value = decode(result.state);
      if (
        !matches(value) ||
        value?.status !== "ready" ||
        (kind === "verify"
          ? value.phase !== "ready"
          : !["consented", "completed"].includes(value.phase))
      ) {
        fail();
        return;
      }
      setState(value);
      setStateIdentity(identity);
      setMessage(
        kind === "verify"
          ? "Verification checked. Review the next step below."
          : value.phase === "completed"
            ? "First-Owner setup is completed for your account."
            : "Consent recorded. Operator approval is still needed.",
      );
    } catch {
      if (mounted.current && token === generation.current) fail();
    } finally {
      // Drop this request's transient form values after its transport settles.
      form.delete("code");
      form.delete("confirm");
      if (requestForm.current === form) requestForm.current = null;
      if (mounted.current && token === generation.current) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <section className="owner-setup-manager" aria-label="Owner setup" aria-busy={pending}>
      <p className="identity-description">
        Consent does not activate Owner access. Separate trusted operator approval is still needed.
      </p>
      {current?.phase === "mfa_required" && (
        <>
          <h2>Verify your authenticator</h2>
          <p className="identity-description">
            Use your already enrolled authenticator. To enroll one, visit{" "}
            <a className="identity-text-link" href="/account/security">
              account security
            </a>
            .
          </p>
          <form
            className="identity-form"
            method="post"
            autoComplete="off"
            aria-busy={pending}
            onSubmit={(event) => {
              event.preventDefault();
              void submit("verify");
            }}
          >
            <div className="identity-field">
              <label htmlFor="owner-setup-code">Six-digit authenticator code</label>
              <input
                id="owner-setup-code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="off"
                required
                disabled={pending}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="identity-button"
              disabled={pending || !/^[0-9]{6}(?![\s\S])/.test(code)}
            >
              Verify authenticator
            </button>
          </form>
        </>
      )}
      {current?.phase === "ready" && (
        <>
          <h2>Review and consent</h2>
          <p className="identity-description">
            Your current account can record consent for this setup. This is not a role assignment.
          </p>
          <form
            className="identity-form"
            method="post"
            aria-busy={pending}
            onSubmit={(event) => {
              event.preventDefault();
              void submit("consent");
            }}
          >
            <label className="owner-setup-confirm">
              <input
                type="checkbox"
                name="confirm"
                value="yes"
                checked={confirmed}
                disabled={pending}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>I consent to first-Owner setup for my current account.</span>
            </label>
            <button type="submit" className="identity-button" disabled={pending || !confirmed}>
              Record my consent
            </button>
          </form>
        </>
      )}
      {current?.phase === "consented" && current.intent && (
        <div data-owner-setup-intent>
          <h2>Consent recorded, not activated</h2>
          <p className="identity-description">
            Operator approval is still needed before Owner access can be activated. This reference
            does not grant access.
          </p>
          <dl className="identity-details">
            <div>
              <dt>Opaque intent reference</dt>
              <dd>{current.intent.id}</dd>
            </div>
            <div>
              <dt>Expires at (UTC)</dt>
              <dd>
                <time dateTime={current.intent.expiresAt}>{current.intent.expiresAt}</time>
              </dd>
            </div>
          </dl>
        </div>
      )}
      {current?.phase === "completed" && (
        <p className="identity-description">
          First-Owner setup is completed for your account. No role assignment can be performed here.
        </p>
      )}
      {!current && (
        <p className="identity-description">
          Owner setup is unavailable until current self access is confirmed. No other account’s
          setup information is shown.
        </p>
      )}
      <p className="identity-form-status" role="status" aria-live="polite">
        {message ||
          (pending
            ? "Checking your current setup…"
            : "Refresh explicitly to check the current setup status.")}
      </p>
      <button
        className="identity-button"
        type="button"
        disabled={pending}
        onClick={() => {
          void refresh.current();
        }}
      >
        Refresh setup status
      </button>
    </section>
  );
}
