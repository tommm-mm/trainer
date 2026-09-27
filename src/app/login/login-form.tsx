"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-neutral-400">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-base outline-none focus:border-emerald-500"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-neutral-400">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-base outline-none focus:border-emerald-500"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-emerald-500 py-2.5 font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
