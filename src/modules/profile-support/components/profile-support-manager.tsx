"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { checkProfileSupportSessionAction, loadProfileSupportAction } from "../actions";
import { decodeProfileSupportRecord, profileSupportSubjectPattern } from "../policy";
import type { ProfileSupportRecord } from "../types";

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], "value"))
  );
}
const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}(?![\s\S])/;
const accessUnavailable =
  "Profile support access could not be confirmed. Look up the customer again or check account security.";
const readUnavailable =
  "Profile support could not be loaded. Look up the customer again before another request.";

export function ProfileSupportManager({
  subject,
  customerSubject,
  username,
}: {
  subject: string;
  customerSubject: string;
  username: string;
}) {
  const identity = `${subject}:${customerSubject}:${username}`;
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ProfileSupportRecord | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef<number | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const lease = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    function invalidate() {
      generation.current++;
      lease.current = false;
      inFlight.current = null;
      setReadyIdentity(null);
      setProfile(null);
      setPending(false);
      setReason("");
      setMessage("");
    }
    async function revalidate() {
      invalidate();
      const token = generation.current;
      try {
        const state: unknown = await checkProfileSupportSessionAction();
        if (!mounted.current || token !== generation.current) return;
        if (
          exactObject(state, ["status", "subject"]) &&
          state.status === "ready" &&
          state.subject === subject &&
          profileSupportSubjectPattern.test(subject) &&
          profileSupportSubjectPattern.test(customerSubject) &&
          subject !== customerSubject &&
          usernamePattern.test(username)
        ) {
          lease.current = true;
          setReadyIdentity(`${subject}:${customerSubject}:${username}`);
        } else setMessage(accessUnavailable);
      } catch {
        if (mounted.current && token === generation.current) setMessage(accessUnavailable);
      }
    }
    // Every setup, including StrictMode replay, renews only self-capability.
    void revalidate();
    const hide = () => {
      flushSync(invalidate);
    };
    const restore = () => {
      // Clear synchronously before a persisted-page snapshot or restored paint.
      flushSync(invalidate);
      if (document.visibilityState !== "hidden") void revalidate();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    window.addEventListener("focus", restore);
    window.addEventListener("storage", restore);
    document.addEventListener("visibilitychange", restore);
    return () => {
      mounted.current = false;
      invalidate();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("focus", restore);
      window.removeEventListener("storage", restore);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [subject, customerSubject, username]);
  const enabled = readyIdentity === identity;
  function edit(value: string) {
    generation.current++;
    setProfile(null);
    setMessage("");
    setReason(value);
  }
  function failRead() {
    lease.current = false;
    setReadyIdentity(null);
    setReason("");
    setProfile(null);
    setMessage(readUnavailable);
  }
  async function load() {
    if (
      !mounted.current ||
      !lease.current ||
      !enabled ||
      inFlight.current !== null ||
      reason !== "profile_help"
    )
      return;
    const token = ++generation.current;
    inFlight.current = token;
    setPending(true);
    setProfile(null);
    setMessage("");
    const data = new FormData();
    data.set("expected_subject", subject);
    data.set("target_subject", customerSubject);
    data.set("username", username);
    data.set("reason", reason);
    try {
      const value: unknown = await loadProfileSupportAction(data);
      if (!mounted.current || token !== generation.current) return;
      const result =
        exactObject(value, ["status", "message", "profile"]) &&
        value.status === "ready" &&
        typeof value.message === "string"
          ? decodeProfileSupportRecord(value.profile, customerSubject, username)
          : { valid: false as const };
      if (result.valid) {
        setProfile(result.profile);
        setMessage("Profile support loaded for this Customer.");
      } else failRead();
    } catch {
      if (mounted.current && token === generation.current) failRead();
    } finally {
      if (mounted.current && inFlight.current === token) {
        inFlight.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section className="profile-support-manager" aria-labelledby="profile-support-heading">
      <h2 id="profile-support-heading">Customer profile support</h2>
      <p className="identity-description">
        Only the selected Customer’s optional phone can be shown. Each disclosure is audited.
      </p>
      <dl className="identity-details" aria-label="Selected Customer">
        <div>
          <dt>Selected Customer</dt>
          <dd>{username}</dd>
        </div>
        <div>
          <dt>Customer ID</dt>
          <dd>{customerSubject}</dd>
        </div>
      </dl>
      <form
        className="identity-form profile-support-form"
        method="post"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="identity-field">
          <label htmlFor="profile-support-reason">Profile support reason</label>
          <select
            id="profile-support-reason"
            name="reason"
            required
            disabled={!enabled}
            value={reason}
            onChange={(event) => edit(event.target.value)}
          >
            <option value="">Choose a reason for this disclosure</option>
            <option value="profile_help">Profile help</option>
          </select>
        </div>
        <button className="identity-button" type="submit" disabled={!enabled || pending}>
          View profile support
        </button>
      </form>
      <p className="identity-form-status" role="status" aria-live="polite">
        {message ||
          (!enabled
            ? "Checking your current profile support access…"
            : pending
              ? "Loading profile support…"
              : "No profile support loaded.")}
      </p>
      {enabled && profile && (
        <div data-profile-support-record>
          <p className="identity-description">
            Customer-supplied, unverified phone. This is not identity proof.
          </p>
          <dl className="identity-details">
            <div>
              <dt>Phone</dt>
              <dd>{profile.phone ?? "Not provided"}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
