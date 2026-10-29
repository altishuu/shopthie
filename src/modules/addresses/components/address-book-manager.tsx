"use client";

import { useActionState, useState } from "react";
import { mutateAddressAction } from "../actions";
import { decodeAddressBook } from "../policy";
import type { AddressBook, AddressFormState, SavedAddress } from "../types";
import { changeAddressCountry, changeAddressSubdivision, createAddressDraft } from "../ui";
import type { AddressDraft } from "../ui";
import type { GeographyCountry } from "@/modules/geography/types";

type Editor =
  | { mode: "edit"; draft: AddressDraft; manualRegion: boolean }
  | { mode: "delete"; id: string; revision: number }
  | null;
const idle: AddressFormState = { status: "idle", message: "", book: null };

export function AddressBookManager({
  initialBook,
  subject,
  countries,
}: {
  initialBook: AddressBook;
  subject: string;
  countries: readonly GeographyCountry[];
}) {
  const [book, setBook] = useState(initialBook);
  const [editor, setEditor] = useState<Editor>(null);
  const [feedback, setFeedback] = useState(idle);
  const [, action, pending] = useActionState(
    async (previous: AddressFormState, data: FormData): Promise<AddressFormState> => {
      let result: AddressFormState;
      try {
        result = await mutateAddressAction(previous, data);
        if (result.status === "success") {
          const decoded = decodeAddressBook(
            result.book,
            (code) => countries.find((country) => country.code === code) ?? null,
          );
          if (!decoded.valid || decoded.book.revision !== Number(data.get("revision")) + 1) {
            result = {
              status: "conflict",
              message:
                "The saved result could not be confirmed. Reload addresses before continuing.",
              book: null,
            };
          } else {
            setBook(decoded.book);
            setEditor(null);
          }
        }
      } catch {
        result = {
          status: "error",
          message: "Addresses are currently unavailable. Please try again.",
          book: null,
        };
      }
      setFeedback(result);
      return result;
    },
    idle,
  );
  const conflicted = feedback.status === "conflict";
  const locked = pending || conflicted;
  const otherControlsDisabled = locked || editor !== null;
  const draft = editor?.mode === "edit" ? editor.draft : null;
  const country = countries.find((entry) => entry.code === draft?.country_code);
  const manualRegion =
    editor?.mode === "edit" && (editor.manualRegion || !country?.subdivisions.length);

  function openEditor(address?: SavedAddress) {
    if (otherControlsDisabled) return;
    setFeedback(idle);
    setEditor({
      mode: "edit",
      draft: createAddressDraft(book, address),
      manualRegion: !!address?.subdivision_text,
    });
  }

  function updateDraft(update: (current: AddressDraft) => AddressDraft) {
    setEditor((current) =>
      current?.mode === "edit" ? { ...current, draft: update(current.draft) } : current,
    );
  }

  function cancel() {
    if (locked) return;
    setEditor(null);
    setFeedback(idle);
  }

  const textFields = [
    { key: "label", label: "Label (optional)", limit: 40, required: false },
    { key: "recipient", label: "Recipient", limit: 100, required: true },
    { key: "line1", label: "Address line 1", limit: 180, required: true },
    { key: "line2", label: "Address line 2 (optional)", limit: 180, required: false },
  ] as const;

  return (
    <div className="address-book" aria-busy={pending}>
      {feedback.message && (
        <p
          className={feedback.status === "success" ? "address-saved" : "identity-error"}
          role={feedback.status === "success" ? "status" : "alert"}
        >
          {feedback.message}
        </p>
      )}
      {conflicted && (
        <a className="identity-text-link" href="/account/addresses">
          Reload latest addresses
        </a>
      )}
      <div className="address-book-toolbar">
        <p className="address-help">{book.addresses.length} of 10 addresses saved</p>
        <button
          className="identity-button"
          type="button"
          disabled={otherControlsDisabled || book.addresses.length >= 10}
          onClick={() => openEditor()}
        >
          Add address
        </button>
      </div>
      {book.addresses.length >= 10 && (
        <p className="address-help">Address limit reached. Edit or delete an address first.</p>
      )}
      {book.addresses.length > 0 && !book.addresses.some((entry) => entry.is_default) && (
        <p className="address-help">
          No default address selected. You can choose one when editing.
        </p>
      )}
      {draft && (
        <form
          className="identity-form address-editor"
          action={action}
          aria-label={draft.id ? "Edit address" : "Add address"}
          aria-busy={pending}
        >
          <h2>{draft.id ? "Edit address" : "Add an address"}</h2>
          <p className="address-help" id="address-input-help">
            Required fields are marked “required”. Use single-line text without leading or trailing
            spaces.
          </p>
          <fieldset disabled={locked} aria-describedby="address-input-help">
            <legend className="visually-hidden">Address details</legend>
            <input type="hidden" name="operation" value="save" />
            <input type="hidden" name="id" value={draft.id} />
            <input type="hidden" name="revision" value={draft.revision} />
            <input type="hidden" name="expected_subject" value={subject} />
            {textFields.map((field) => (
              <div className="identity-field" key={field.key}>
                <label htmlFor={`address-${field.key}`}>
                  {field.label}
                  {field.required ? " (required)" : ""}
                </label>
                <input
                  id={`address-${field.key}`}
                  name={field.key}
                  type="text"
                  required={field.required}
                  maxLength={field.limit}
                  autoComplete="off"
                  value={draft[field.key]}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              </div>
            ))}
            <div className="identity-field">
              <label htmlFor="address-country">Country (required)</label>
              <select
                id="address-country"
                name="country_code"
                required
                value={draft.country_code}
                onChange={(event) => {
                  const code = event.target.value;
                  setEditor((current) =>
                    current?.mode === "edit"
                      ? {
                          ...current,
                          draft: changeAddressCountry(current.draft, code),
                          manualRegion: false,
                        }
                      : current,
                  );
                }}
              >
                <option value="">Choose a country</option>
                {countries.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
            {country ? (
              <div className="identity-field">
                <label htmlFor="address-subdivision">
                  {country.subdivisionLabel}
                  {country.requireSubdivision ? " (required)" : " (optional)"}
                  {manualRegion ? " — manual, unverified" : ""}
                </label>
                {manualRegion ? (
                  <>
                    <input
                      id="address-subdivision"
                      name="subdivision_text"
                      type="text"
                      autoComplete="off"
                      maxLength={100}
                      required={country.requireSubdivision}
                      aria-describedby="address-region-help"
                      value={draft.subdivision_text}
                      onChange={(event) =>
                        updateDraft((current) =>
                          changeAddressSubdivision(current, "text", event.target.value),
                        )
                      }
                    />
                    <input type="hidden" name="subdivision_code" value="" />
                  </>
                ) : (
                  <>
                    <select
                      id="address-subdivision"
                      name="subdivision_code"
                      required={country.requireSubdivision}
                      value={draft.subdivision_code}
                      aria-describedby="address-region-help"
                      onChange={(event) =>
                        updateDraft((current) =>
                          changeAddressSubdivision(current, "code", event.target.value),
                        )
                      }
                    >
                      <option value="">Choose {country.subdivisionLabel.toLowerCase()}</option>
                      {country.subdivisions.map((region) => (
                        <option key={region.code} value={region.code}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="subdivision_text" value="" />
                  </>
                )}
                <p className="address-help" id="address-region-help">
                  {manualRegion
                    ? "Manual region text is an unverified fallback for incomplete reference coverage."
                    : "Administrative regions can differ from postal areas. If yours is missing or different, enter it manually as unverified text."}
                </p>
                {country.subdivisions.length > 0 && (
                  <button
                    className="address-secondary"
                    type="button"
                    onClick={() => {
                      setEditor((current) =>
                        current?.mode === "edit"
                          ? {
                              ...current,
                              manualRegion: !manualRegion,
                              draft: changeAddressSubdivision(
                                current.draft,
                                manualRegion ? "code" : "text",
                                "",
                              ),
                            }
                          : current,
                      );
                    }}
                  >
                    {manualRegion ? "Use reference region list" : "Region missing? Enter manually"}
                  </button>
                )}
              </div>
            ) : (
              <>
                <input type="hidden" name="subdivision_code" value="" />
                <input type="hidden" name="subdivision_text" value="" />
              </>
            )}
            <div className="identity-field">
              <label htmlFor="address-locality">
                Locality / city{country?.requireLocality ? " (required)" : " (optional)"}
              </label>
              <input
                id="address-locality"
                name="locality"
                type="text"
                autoComplete="off"
                maxLength={100}
                required={country?.requireLocality ?? false}
                value={draft.locality}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, locality: event.target.value }))
                }
              />
            </div>
            <div className="identity-field">
              <label htmlFor="address-postal">
                Postal code{country?.requirePostal ? " (required)" : " (optional)"}
              </label>
              <input
                id="address-postal"
                name="postal_code"
                type="text"
                autoComplete="off"
                maxLength={32}
                required={country?.requirePostal ?? false}
                value={draft.postal_code}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, postal_code: event.target.value }))
                }
              />
            </div>
            <input type="hidden" name="is_default" value={draft.is_default ? "true" : "false"} />
            <label className="address-default" htmlFor="address-default">
              <input
                id="address-default"
                type="checkbox"
                checked={draft.is_default}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, is_default: event.target.checked }))
                }
              />
              Use as default address
            </label>
            <p className="address-help">
              Optional. Selecting this clears any other default; unchecking it can leave no default.
            </p>
            <div className="address-actions">
              <button className="identity-button" type="submit">
                {pending ? "Saving…" : "Save address"}
              </button>
              <button className="address-secondary" type="button" onClick={cancel}>
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {book.addresses.length === 0 ? (
        <p className="address-empty">No saved addresses yet. Add one when you’re ready.</p>
      ) : (
        <ul className="address-list" aria-label="Saved addresses">
          {book.addresses.map((address, index) => {
            const reference = countries.find((entry) => entry.code === address.country_code);
            const region = reference?.subdivisions.find(
              (entry) => entry.code === address.subdivision_code,
            );
            const deleting = editor?.mode === "delete" && editor.id === address.id;
            return (
              <li className="address-card" key={address.id}>
                <h2>{address.label ?? `Address ${index + 1}`}</h2>
                {address.is_default && <p className="address-badge">Default address</p>}
                <p className="address-lines">
                  <span>{address.recipient}</span>
                  <span>{address.line1}</span>
                  {address.line2 && <span>{address.line2}</span>}
                  {(region || address.subdivision_text) && (
                    <span>
                      {region?.name ?? address.subdivision_text}
                      {address.subdivision_text ? " (manual, unverified)" : ""}
                    </span>
                  )}
                  {address.locality && <span>{address.locality}</span>}
                  {address.postal_code && <span>{address.postal_code}</span>}
                  <span>{reference?.name ?? address.country_code}</span>
                </p>
                <div className="address-actions">
                  <button
                    className="address-secondary"
                    type="button"
                    disabled={otherControlsDisabled}
                    aria-label={`Edit address ${index + 1}`}
                    onClick={() => openEditor(address)}
                  >
                    Edit
                  </button>
                  <button
                    className="address-secondary"
                    type="button"
                    disabled={otherControlsDisabled}
                    aria-label={`Delete address ${index + 1}`}
                    onClick={() => {
                      if (otherControlsDisabled) return;
                      setFeedback(idle);
                      setEditor({ mode: "delete", id: address.id, revision: book.revision });
                    }}
                  >
                    Delete
                  </button>
                </div>
                {deleting && (
                  <form
                    className="address-delete"
                    action={action}
                    aria-label={`Confirm delete address ${index + 1}`}
                  >
                    <p>Delete this saved address? This cannot be undone.</p>
                    {address.is_default && (
                      <p className="address-help">
                        This removes your default. No replacement will be selected.
                      </p>
                    )}
                    <fieldset disabled={locked}>
                      <legend className="visually-hidden">Confirm address deletion</legend>
                      <input type="hidden" name="operation" value="delete" />
                      <input type="hidden" name="id" value={editor.id} />
                      <input type="hidden" name="revision" value={editor.revision} />
                      <input type="hidden" name="expected_subject" value={subject} />
                      <div className="address-actions">
                        <button className="identity-button" type="submit">
                          {pending ? "Deleting…" : "Confirm delete"}
                        </button>
                        <button className="address-secondary" type="button" onClick={cancel}>
                          Keep address
                        </button>
                      </div>
                    </fieldset>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="identity-form-status" role="status">
        {pending ? "Updating your addresses. Please wait." : ""}
      </p>
    </div>
  );
}
