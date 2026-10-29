"use client";

import { useEffect, useRef, useState } from "react";
import { lookupCustomerAction } from "../actions";
import type { LookupActionResult, LookupReason } from "../types";

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

export function CustomerLookupManager({ subject }: { subject: string }) {
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LookupActionResult | null>(null);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function edit() {
    revision.current++;
    setResult(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
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
      inFlight.current = false;
      if (mounted.current) setPending(false);
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
        <button className="identity-button" type="submit" disabled={pending}>
          {pending ? "Looking up…" : "Look up customer"}
        </button>
      </form>
      <p className="identity-form-status" role="status" aria-live="polite">
        {pending ? "Looking up customer…" : result?.message}
      </p>
      {result?.status === "found" && result.customer && (
        <dl className="identity-details customer-lookup-result" aria-label="Customer lookup result">
          <div>
            <dt>Username</dt>
            <dd>{result.customer.username}</dd>
          </div>
          <div>
            <dt>Customer ID</dt>
            <dd>{result.customer.subject}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{result.customer.status}</dd>
          </div>
        </dl>
      )}
    </>
  );
}
