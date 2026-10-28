"use client";

import { useActionState, useState } from "react";
import { saveProfileAction } from "../actions";
import type { Profile, ProfileFormState } from "../types";

export function ProfileForm({ profile, subject }: { profile: Profile | null; subject: string }) {
  const [draft, setDraft] = useState({
    username: profile?.username ?? "",
    phone: profile?.phone ?? "",
    revision: profile?.revision ?? 0,
  });
  const initial: ProfileFormState = { status: "idle", message: "", profile };
  const [state, action, pending] = useActionState(
    async (previous: ProfileFormState, data: FormData) => {
      const result = await saveProfileAction(previous, data);
      if (result.status === "success" && result.profile) {
        setDraft({
          username: result.profile.username,
          phone: result.profile.phone ?? "",
          revision: result.profile.revision,
        });
      }
      return result;
    },
    initial,
  );
  const failed = state.status === "error" || state.status === "conflict";

  return (
    <form className="identity-form" aria-label="Edit profile" aria-busy={pending} action={action}>
      {state.message && (
        <p
          className={failed ? "identity-error" : "profile-saved"}
          role={failed ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
      {state.status === "conflict" && (
        <a className="identity-text-link" href="/account/profile">
          Reload latest profile
        </a>
      )}
      <fieldset disabled={pending || state.status === "conflict"}>
        <legend className="visually-hidden">Your profile details</legend>
        <div className="identity-field">
          <label htmlFor="profile-username">Username</label>
          <input
            id="profile-username"
            name="username"
            type="text"
            autoComplete="nickname"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={32}
            pattern={String.raw`[A-Za-z0-9][A-Za-z0-9_\-]{2,31}`}
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            aria-describedby="profile-username-help"
          />
          <p className="profile-help" id="profile-username-help">
            3–32 letters, numbers, underscores or hyphens. Start with a letter or number. Usernames
            are unique regardless of capitalization.
          </p>
        </div>
        <div className="identity-field">
          <label htmlFor="profile-phone">Phone (optional)</label>
          <input
            id="profile-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={16}
            pattern={String.raw`\+[1-9][0-9]{1,14}`}
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            aria-describedby="profile-phone-help"
          />
          <p className="profile-help" id="profile-phone-help">
            Use + followed by 2–15 digits including your country code. Format only—not verified, and
            no SMS is sent. Leave blank to remove it.
          </p>
        </div>
        <input type="hidden" name="revision" value={draft.revision} />
        <input type="hidden" name="expected_subject" value={subject} />
        <button className="identity-button" type="submit">
          {pending ? "Saving…" : "Save profile"}
        </button>
      </fieldset>
      <p className="identity-form-status" role="status">
        {pending ? "Saving your profile. Please wait." : ""}
      </p>
    </form>
  );
}
