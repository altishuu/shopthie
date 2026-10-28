export type Profile = { username: string; phone: string | null; revision: number };
export type ProfilePageState =
  | { status: "ready"; profile: Profile | null; subject: string }
  | { status: "guest" }
  | { status: "denied"; message: string };
export type ProfileFormState = {
  status: "idle" | "error" | "conflict" | "success";
  message: string;
  profile: Profile | null;
};
export type ProfileInput =
  | { valid: false }
  | {
      valid: true;
      username: string;
      phone: string | null;
      revision: number;
      expectedSubject: string;
    };
