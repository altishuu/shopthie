"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { mfaAction } from "../actions";
import { confirmMfaResult } from "../ui";
import type { MfaContext, MfaEnrollment } from "../types";

export function SecurityManager({ initialContext }: { initialContext: MfaContext }) {
  const [context, setContext] = useState(initialContext);
  const [setup, setSetup] = useState<MfaEnrollment | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const inFlight = useRef(false);
  const mustReload = useRef(false);
  const locked = pending || reloadRequired;

  function lockUntilReload() {
    mustReload.current = true;
    setReloadRequired(true);
    setSetup(null);
    setFailed(true);
    setMessage(
      "The security update could not be confirmed. Reload account security before continuing.",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || mustReload.current) return;
    const data = new FormData(event.currentTarget);
    const codeField = event.currentTarget.elements.namedItem("code");
    if (codeField && "value" in codeField) codeField.value = "";
    inFlight.current = true;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await mfaAction(data);
      if (
        result?.status === "error" &&
        typeof result.message === "string" &&
        !result.reloadRequired
      ) {
        setFailed(true);
        setMessage(result.message);
      } else if (
        confirmMfaResult(
          context,
          String(data.get("operation")),
          data.get("factor_id") as string | null,
          result,
        )
      ) {
        setContext(result.context);
        setSetup(result.status === "enrollment" ? result.enrollment : null);
        setMessage(result.message);
      } else {
        lockUntilReload();
      }
    } catch {
      // A lost response may follow a completed provider mutation: never retry blindly.
      lockUntilReload();
    } finally {
      data.delete("code");
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="security-manager" aria-busy={pending}>
      {message && (
        <p
          className={failed ? "identity-error" : "security-help"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {reloadRequired && (
        <a className="identity-text-link" href="/account/security">
          Reload account security
        </a>
      )}
      <p className="identity-description">Add an authenticator app for an extra sign-in check.</p>
      {setup && (
        <section className="security-setup" aria-label="Private authenticator setup">
          <h2>Connect your authenticator</h2>
          <p className="security-help">
            Scan this private QR code in your authenticator app, or enter the setup key manually. Do
            not share either.
          </p>
          {/* Data-image only: SVG is never inserted into the document as HTML. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="security-qr"
            src={setup.qrCode}
            alt="Authenticator setup QR code"
            width={224}
            height={224}
          />
          <p className="security-help">
            Setup key: <code className="security-secret">{setup.secret}</code>
          </p>
        </section>
      )}
      {context.factors.length === 0 && !context.otherVerifiedFactor && (
        <form
          className="identity-form"
          method="post"
          aria-label="Set up authenticator"
          onSubmit={submit}
        >
          <p className="security-help" id="security-backup-help">
            If you lose access to your authenticator, you may lose access to your account. Shopthie
            provides no recovery codes or reset flow here. Keep a secure backup of your
            authenticator before enabling this extra sign-in check. Never share your setup key or
            codes.
          </p>
          <fieldset disabled={locked}>
            <legend className="visually-hidden">Authenticator setup</legend>
            <input type="hidden" name="operation" value="enroll" />
            <input type="hidden" name="expected_subject" value={initialContext.subject} />
            <label className="security-check">
              <input
                type="checkbox"
                name="acknowledge_backup"
                value="yes"
                required
                aria-describedby="security-backup-help"
              />
              <span>
                I understand the lockout risk and will keep a secure authenticator backup.
              </span>
            </label>
            <button className="identity-button" type="submit">
              Set up authenticator
            </button>
          </fieldset>
        </form>
      )}
      {context.otherVerifiedFactor && (
        <p className="security-help">
          Another verified factor type is present. It cannot be managed or used for verification on
          this page.
        </p>
      )}
      {context.role !== "customer" && (
        <p className="security-help">
          Staff access requires both a verified authenticator and a verified session. Set up an
          authenticator, then verify a current code to continue. Removing an enabled staff
          authenticator is not available here.
        </p>
      )}
      {context.factors.length > 0 && (
        <ul className="security-factors" aria-label="Authenticators">
          {context.factors.map((factor, index) => {
            const verified = factor.status === "verified";
            const canVerify = verified ? context.aal === "aal1" : setup?.factorId === factor.id;
            const canRemove = verified && context.role === "customer" && context.aal === "aal2";
            const operation = canRemove ? "remove" : "verify";
            return (
              <li className="security-factor" key={factor.id}>
                <h2>Authenticator {index + 1}</h2>
                <p className="security-help">
                  {verified ? "Enabled" : "Pending setup — not enabled"}
                </p>
                {!verified && setup?.factorId !== factor.id && (
                  <p className="security-help">
                    {context.role === "customer"
                      ? "Setup details are unavailable after reload. Explicitly cancel this pending setup and begin again."
                      : "Setup details are unavailable after reload. Staff setup has no in-app cancellation or restart. If you have lost the setup details, contact the project operator."}
                  </p>
                )}
                {(canVerify || canRemove) && (
                  <form
                    className="identity-form"
                    method="post"
                    onSubmit={submit}
                    aria-label={`${canRemove ? "Remove" : "Verify"} authenticator ${index + 1}`}
                  >
                    <fieldset disabled={locked}>
                      <legend className="visually-hidden">Current authenticator code</legend>
                      <input type="hidden" name="operation" value={operation} />
                      <input type="hidden" name="expected_subject" value={context.subject} />
                      <input type="hidden" name="factor_id" value={factor.id} />
                      <div className="identity-field">
                        <label htmlFor={`security-code-${index}`}>
                          Current 6-digit authenticator code (required)
                        </label>
                        <input
                          id={`security-code-${index}`}
                          name="code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          minLength={6}
                          maxLength={6}
                          required
                        />
                      </div>
                      {canRemove && (
                        <label className="security-check">
                          <input type="checkbox" name="confirm_remove" value="yes" required />
                          <span>
                            I understand that removing this authenticator reduces my account
                            protection.
                          </span>
                        </label>
                      )}
                      <button className="identity-button" type="submit">
                        {canRemove ? "Remove authenticator" : "Verify authenticator"}
                      </button>
                    </fieldset>
                  </form>
                )}
                {!verified && context.role === "customer" && (
                  <form
                    className="identity-form"
                    method="post"
                    onSubmit={submit}
                    aria-label={`Cancel pending setup ${index + 1}`}
                  >
                    <fieldset disabled={locked}>
                      <legend className="visually-hidden">Cancel pending authenticator</legend>
                      <input type="hidden" name="operation" value="cancel" />
                      <input type="hidden" name="expected_subject" value={context.subject} />
                      <input type="hidden" name="factor_id" value={factor.id} />
                      <button className="security-secondary" type="submit">
                        Cancel pending setup
                      </button>
                    </fieldset>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="identity-form-status" role="status">
        {pending ? "Updating account security. Please wait." : ""}
      </p>
    </div>
  );
}
