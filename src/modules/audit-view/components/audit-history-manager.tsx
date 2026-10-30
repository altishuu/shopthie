"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { checkAuditViewSessionAction, loadAuditEventsAction } from "../actions";
import { decodeAuditPage } from "../policy";
import type { AuditCursor, AuditPage, AuditScope } from "../types";

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const unavailable =
  "Audit history could not be loaded. Return to staff entry to check current access.";
const eventLabels = {
  "customer.lookup": "Customer lookup",
  "customer.status.read": "Application access check",
  "customer.status.change": "Application access change",
};
const reasonLabels = {
  account_access: "Account access",
  profile_help: "Profile help",
  address_help: "Address help",
  account_security: "Account security",
  customer_request: "Customer request",
  account_review: "Account review",
};
const outcomeLabels = {
  found: "Found",
  not_found: "Not found",
  read: "Read",
  active: "Active",
  suspended: "Suspended",
};

export function AuditHistoryManager({ subject, scope }: { subject: string; scope: AuditScope }) {
  const identity = `${subject}:${scope}`;
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null);
  const [page, setPage] = useState<AuditPage | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const inFlight = useRef<number | null>(null);
  const mounted = useRef(false);
  const lease = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    function invalidate() {
      generation.current++;
      lease.current = false;
      inFlight.current = null;
      setReadyIdentity(null);
      setPage(null);
      setPending(false);
      setMessage("");
    }
    async function revalidate() {
      invalidate();
      const token = generation.current;
      try {
        const state: unknown = await checkAuditViewSessionAction();
        if (!mounted.current || generation.current !== token) return;
        if (
          exactObject(state, ["status", "subject", "scope"]) &&
          state.status === "ready" &&
          state.subject === subject &&
          state.scope === scope &&
          subject.length === 36 &&
          uuid.test(subject) &&
          (scope === "own" || scope === "all")
        ) {
          lease.current = true;
          setReadyIdentity(`${subject}:${scope}`);
        } else
          setMessage(
            "Audit access could not be confirmed. Return to staff entry or check account security.",
          );
      } catch {
        if (mounted.current && generation.current === token)
          setMessage(
            "Audit access could not be confirmed. Return to staff entry or check account security.",
          );
      }
    }
    // Every effect setup (including StrictMode replay and Activity restoration)
    // clears retained state and requests only a new self-capability, never events.
    void revalidate();
    const hide = () => {
      flushSync(invalidate);
    };
    const restore = () => {
      // Flush before a persisted-page snapshot/paint can expose the previous page.
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
  }, [subject, scope]);
  const enabled = readyIdentity === identity;

  async function load(before: AuditCursor | null) {
    if (!mounted.current || !lease.current || !enabled || inFlight.current !== null) return;
    const token = ++generation.current;
    inFlight.current = token;
    setPending(true);
    setPage(null);
    setMessage("");
    const data = new FormData();
    data.set("expected_subject", subject);
    data.set("cursor_created_at", before?.createdAt ?? "");
    data.set("cursor_id", before?.id ?? "");
    try {
      const value: unknown = await loadAuditEventsAction(data);
      if (!mounted.current || token !== generation.current) return;
      const result =
        exactObject(value, ["status", "message", "page"]) &&
        value.status === "ready" &&
        typeof value.message === "string"
          ? decodeAuditPage(value.page, subject, scope, before)
          : { valid: false as const };
      if (result.valid) {
        setPage(result.page);
        setMessage(
          result.page.events.length
            ? "Current page loaded. Older events replace this page."
            : "No supported events in this page.",
        );
      } else {
        lease.current = false;
        setReadyIdentity(null);
        setMessage(unavailable);
      }
    } catch {
      if (mounted.current && token === generation.current) {
        lease.current = false;
        setReadyIdentity(null);
        setMessage(unavailable);
      }
    } finally {
      if (mounted.current && inFlight.current === token) {
        inFlight.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section className="audit-history-manager" aria-labelledby="audit-history-heading">
      <h2 id="audit-history-heading">Supported events</h2>
      <p className="identity-description">
        {scope === "own"
          ? "Admin scope: only your own supported operations are shown."
          : "Owner scope: supported operations across all actors are shown."}
      </p>
      <div className="audit-history-controls" aria-busy={pending}>
        <button
          className="identity-button"
          type="button"
          disabled={!enabled || pending}
          onClick={() => {
            void load(null);
          }}
        >
          Load recent events
        </button>
        {enabled && page?.nextCursor && (
          <button
            className="identity-button"
            type="button"
            disabled={pending}
            onClick={() => {
              void load(page.nextCursor);
            }}
          >
            Older events
          </button>
        )}
      </div>
      <p className="identity-form-status" role="status" aria-live="polite">
        {message ||
          (!enabled
            ? "Checking your current audit access…"
            : pending
              ? "Loading one page…"
              : "No events loaded. Choose Load recent events to read a page.")}
      </p>
      {enabled && page && page.events.length > 0 && (
        <ol className="audit-history-events" aria-label="Current audit page">
          {page.events.map((event) => (
            <li key={event.id} className="audit-history-event" data-audit-event>
              <h3>{eventLabels[event.eventType]}</h3>
              <dl>
                <div>
                  <dt>When (UTC)</dt>
                  <dd>
                    <time dateTime={event.createdAt}>
                      {event.createdAt.replace("T", " ").replace("Z", " UTC")}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{reasonLabels[event.reason]}</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>{outcomeLabels[event.outcome]}</dd>
                </div>
                <div>
                  <dt>Actor ID</dt>
                  <dd>{event.actorSubject}</dd>
                </div>
                <div>
                  <dt>Target ID</dt>
                  <dd>{event.targetSubject ?? "No match"}</dd>
                </div>
                <div>
                  <dt>Event ID</dt>
                  <dd>{event.id}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
