"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  checkCustomerStatusSessionAction,
  loadCustomerStatusAction,
  changeCustomerStatusAction,
} from "../actions";
import type { CustomerStatusRecord, StatusReason } from "../types";

const reasons: StatusReason[] = ["account_security", "customer_request", "account_review"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const unavailable =
  "Application access could not be confirmed. Check current access before another change.";

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

// Reconstruct a minimal record; never retain or display free-form action messages.
function decode(
  value: unknown,
  target: string,
  expected: "ready" | "success",
): CustomerStatusRecord | null {
  if (
    !exactObject(value, ["status", "message", "record"]) ||
    value.status !== expected ||
    typeof value.message !== "string" ||
    !exactObject(value.record, ["subject", "status", "revision"])
  )
    return null;
  const record = value.record;
  if (
    typeof record.subject !== "string" ||
    !uuid.test(record.subject) ||
    record.subject !== target ||
    (record.status !== "active" && record.status !== "suspended") ||
    typeof record.revision !== "number" ||
    !Number.isInteger(record.revision) ||
    record.revision < 0 ||
    record.revision > 2147483647
  )
    return null;
  return { subject: record.subject, status: record.status, revision: record.revision };
}

export function CustomerStatusManager({
  actorSubject,
  customerSubject,
}: {
  actorSubject: string;
  customerSubject: string;
}) {
  const [reason, setReason] = useState("");
  const [record, setRecord] = useState<CustomerStatusRecord | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const inFlight = useRef<number | null>(null);
  const mounted = useRef(false);
  const lease = useRef(false);
  const scope = `${actorSubject}:${customerSubject}`;
  const [readyScope, setReadyScope] = useState<string | null>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    function invalidate() {
      sequence.current++;
      lease.current = false;
      inFlight.current = null;
      setReadyScope(null);
      setRecord(null);
      setConfirmed(false);
      setReason("");
      setPending(false);
      setMessage("");
    }
    async function revalidate() {
      invalidate();
      const token = sequence.current;
      try {
        const state: unknown = await checkCustomerStatusSessionAction();
        if (
          mounted.current &&
          token === sequence.current &&
          exactObject(state, ["status", "subject"]) &&
          state.status === "ready" &&
          state.subject === actorSubject &&
          uuid.test(actorSubject)
        ) {
          lease.current = true;
          setReadyScope(`${actorSubject}:${customerSubject}`);
        }
      } catch {
        // No lease without positive current status-capability/subject readiness.
      }
    }
    // Every setup (including StrictMode replay/Activity restoration) starts empty.
    // Only self-readiness is renewed; target reads/changes always require a click.
    void revalidate();
    window.addEventListener("pagehide", invalidate);
    window.addEventListener("pageshow", invalidate);
    window.addEventListener("focus", invalidate);
    window.addEventListener("storage", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      mounted.current = false;
      invalidate();
      window.removeEventListener("pagehide", invalidate);
      window.removeEventListener("pageshow", invalidate);
      window.removeEventListener("focus", invalidate);
      window.removeEventListener("storage", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [actorSubject, customerSubject]);
  const enabled = readyScope === scope;

  function edit() {
    sequence.current++;
    setRecord(null);
    setConfirmed(false);
    setMessage("");
  }
  async function request(change: boolean) {
    if (
      !mounted.current ||
      !lease.current ||
      !enabled ||
      inFlight.current !== null ||
      !reasons.includes(reason as StatusReason) ||
      !uuid.test(actorSubject) ||
      !uuid.test(customerSubject) ||
      actorSubject === customerSubject ||
      (change && (!record || !confirmed || record.revision === 2147483647))
    )
      return;
    const previous = record;
    const desired = previous?.status === "active" ? "suspended" : "active";
    const token = ++sequence.current;
    inFlight.current = token;
    setPending(true);
    setRecord(null);
    setConfirmed(false);
    setMessage("");
    const data = new FormData();
    data.set("expected_subject", actorSubject);
    data.set("target_subject", customerSubject);
    data.set("reason", reason);
    if (change && previous) {
      data.set("revision", String(previous.revision));
      data.set("desired_status", desired);
      data.set("confirm_change", "yes");
    }
    try {
      const value: unknown = await (change
        ? changeCustomerStatusAction(data)
        : loadCustomerStatusAction(data));
      if (!mounted.current || token !== sequence.current) return;
      const next = decode(value, customerSubject, change ? "success" : "ready");
      if (
        next &&
        (!change ||
          (previous && next.status === desired && next.revision === previous.revision + 1))
      ) {
        if (change)
          setMessage("Application access updated. Check current access before another change.");
        else {
          setRecord(next);
          setMessage("Current application access checked.");
        }
      } else setMessage(unavailable);
    } catch {
      if (mounted.current && token === sequence.current) setMessage(unavailable);
    } finally {
      if (mounted.current && inFlight.current === token) {
        inFlight.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section className="customer-status-manager" aria-labelledby="customer-status-heading">
      <h2 id="customer-status-heading">Customer application access</h2>
      <p className="identity-description">
        Suspend or reactivate application access only. This is not an Auth provider ban or session
        revocation. Each access check and change is audited.
      </p>
      <form
        className="identity-form customer-status-form"
        method="post"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void request(false);
        }}
      >
        <div className="identity-field">
          <label htmlFor="customer-status-reason">Access change reason</label>
          <select
            id="customer-status-reason"
            name="reason"
            required
            disabled={!enabled}
            value={reason}
            onChange={(event) => {
              edit();
              setReason(event.target.value);
            }}
          >
            <option value="">Choose a reason</option>
            <option value="account_security">Account security</option>
            <option value="customer_request">Customer request</option>
            <option value="account_review">Account review</option>
          </select>
        </div>
        <button type="submit" className="identity-button" disabled={pending || !enabled}>
          Check current access
        </button>
      </form>
      {enabled && record && (
        <div className="customer-status-record">
          <dl className="identity-details">
            <div>
              <dt>Current application access</dt>
              <dd>{record.status}</dd>
            </div>
            <div>
              <dt>Desired application access</dt>
              <dd>{record.status === "active" ? "suspended" : "active"}</dd>
            </div>
          </dl>
          <label className="customer-status-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>Confirm this application-access change</span>
          </label>
          <button
            type="button"
            className="identity-button"
            disabled={!confirmed || pending || record.revision === 2147483647}
            onClick={() => {
              void request(true);
            }}
          >
            {record.status === "active"
              ? "Suspend application access"
              : "Reactivate application access"}
          </button>
        </div>
      )}
      <p className="identity-form-status" role="status" aria-live="polite">
        {!enabled
          ? "Checking your current session. Look up the customer again if access cannot be confirmed."
          : pending
            ? "Confirming application access…"
            : message}
      </p>
    </section>
  );
}
