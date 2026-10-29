"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { checkCustomerLookupSessionAction, lookupCustomerAction } from "../actions";
import type { LookupActionResult, LookupReason } from "../types";
import { CustomerStatusManager } from "../../customer-status/components/customer-status-manager";

const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
const reasons: LookupReason[] = ["account_access", "profile_help", "address_help"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const unavailable: LookupActionResult = {
  status: "error",
  message: "Lookup is unavailable. Please try again.",
  customer: null,
};

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

// Treat even a server action response as untrusted. Never render its free-form message.
function validatedResult(value: unknown, submittedUsername: string): LookupActionResult {
  if (!exactObject(value, ["status", "message", "customer"]) || typeof value.message !== "string")
    return unavailable;
  if ((value.status === "not_found" || value.status === "error") && value.customer === null) {
    return value.status === "not_found"
      ? { status: "not_found", message: "No customer match found.", customer: null }
      : unavailable;
  }
  if (value.status !== "found" || !exactObject(value.customer, ["subject", "username", "status"]))
    return unavailable;
  const customer = value.customer;
  if (
    typeof customer.subject !== "string" ||
    !uuidPattern.test(customer.subject) ||
    typeof customer.username !== "string" ||
    !usernamePattern.test(customer.username) ||
    customer.username.toLowerCase() !== submittedUsername.toLowerCase() ||
    (customer.status !== "active" && customer.status !== "suspended")
  )
    return unavailable;
  return {
    status: "found",
    message: "Customer found.",
    customer: { subject: customer.subject, username: customer.username, status: customer.status },
  };
}

export function CustomerLookupManager({
  subject,
  statusEnabled = false,
}: {
  subject: string;
  statusEnabled?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LookupActionResult | null>(null);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(false);
  const activated = useRef(false);
  const lease = useRef(true);
  const [readySubject, setReadySubject] = useState<string | null>(subject);
  useLayoutEffect(() => {
    mounted.current = true;
    function invalidate() {
      revision.current++;
      lease.current = false;
      inFlight.current = false;
      setReadySubject(null);
      setResult(null);
      setPending(false);
      setUsername("");
      setReason("");
    }
    async function revalidate() {
      invalidate();
      const request = revision.current;
      try {
        const state: unknown = await checkCustomerLookupSessionAction();
        if (
          mounted.current &&
          request === revision.current &&
          exactObject(state, ["status", "subject"]) &&
          state.status === "ready" &&
          state.subject === subject
        ) {
          lease.current = true;
          setReadySubject(subject);
        }
      } catch {
        // A restored form stays closed unless current readiness is positively confirmed.
      }
    }
    function visibility() {
      if (document.visibilityState === "hidden") invalidate();
      else void revalidate();
    }
    const check = () => {
      void revalidate();
    };
    // SSR grants only the initial lease. Activity restoration and actor changes
    // require a fresh identity-only check; never repeat a Customer read.
    if (activated.current) void revalidate();
    activated.current = true;
    window.addEventListener("pagehide", invalidate);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      invalidate();
      window.removeEventListener("pagehide", invalidate);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [subject]);
  const ready = readySubject === subject;

  function edit() {
    revision.current++;
    inFlight.current = false;
    setPending(false);
    setResult(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mounted.current || !lease.current || !ready || inFlight.current) return;
    setResult(null);
    if (!usernamePattern.test(username) || !reasons.includes(reason as LookupReason)) return;
    inFlight.current = true;
    setPending(true);
    const data = new FormData();
    data.set("expected_subject", subject);
    data.set("username", username);
    data.set("reason", reason);
    const submittedRevision = revision.current;
    try {
      const response = await lookupCustomerAction(data);
      if (mounted.current && submittedRevision === revision.current)
        setResult(validatedResult(response, username));
    } catch {
      if (mounted.current && submittedRevision === revision.current) {
        setResult(unavailable);
      }
    } finally {
      if (mounted.current && submittedRevision === revision.current) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <>
      <form
        className="identity-form customer-lookup-form"
        method="post"
        onSubmit={submit}
        aria-busy={pending}
      >
        <input type="hidden" name="expected_subject" value={subject} />
        <div className="identity-field">
          <label htmlFor="lookup-username">Exact username</label>
          <input
            id="lookup-username"
            name="username"
            value={username}
            onChange={(event) => {
              edit();
              setUsername(event.target.value);
            }}
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9][A-Za-z0-9_\-]{2,31}"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={!ready}
            aria-describedby="lookup-hint"
          />
          <p id="lookup-hint" className="identity-form-status">
            3–32 letters, numbers, underscores or hyphens; start with a letter or number. No partial
            or email search.
          </p>
        </div>
        <div className="identity-field">
          <label htmlFor="lookup-reason">Lookup reason</label>
          <select
            id="lookup-reason"
            name="reason"
            required
            value={reason}
            disabled={!ready}
            onChange={(event) => {
              edit();
              setReason(event.target.value);
            }}
          >
            <option value="">Choose a reason</option>
            <option value="account_access">Account access</option>
            <option value="profile_help">Profile help</option>
            <option value="address_help">Address help</option>
          </select>
        </div>
        <button className="identity-button" type="submit" disabled={pending || !ready}>
          {pending ? "Looking up…" : "Look up customer"}
        </button>
      </form>
      <p className="identity-form-status" role="status" aria-live="polite">
        {!ready
          ? "Checking your current session. Reload this page if access cannot be confirmed."
          : pending
            ? "Looking up customer…"
            : result?.message}
      </p>
      {ready && result?.status === "found" && result.customer && (
        <>
          <dl
            className="identity-details customer-lookup-result"
            aria-label="Customer lookup result"
          >
            <div>
              <dt>Username</dt>
              <dd>{result.customer.username}</dd>
            </div>
            <div>
              <dt>Customer ID</dt>
              <dd>{result.customer.subject}</dd>
            </div>
            <div>
              <dt>Status at lookup</dt>
              <dd>{result.customer.status}</dd>
            </div>
          </dl>
          {statusEnabled && (
            <CustomerStatusManager
              key={`${subject}:${result.customer.subject}`}
              actorSubject={subject}
              customerSubject={result.customer.subject}
            />
          )}
        </>
      )}
    </>
  );
}
