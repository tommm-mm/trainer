// Small FormData parsing helpers for Server Actions. They throw
// FormError with a user-facing message; actions catch it and return it.

export class FormError extends Error {}

export type ActionState = { error: string | null; ok?: boolean };

export function text(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function requiredText(form: FormData, key: string, label: string): string {
  const v = text(form, key);
  if (!v) throw new FormError(`${label} is required.`);
  return v;
}

export function num(
  form: FormData,
  key: string,
  label: string,
  opts: { min?: number; max?: number; int?: boolean } = {},
): number | null {
  const raw = text(form, key);
  if (raw === null) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) throw new FormError(`${label} must be a number.`);
  if (opts.int && !Number.isInteger(n)) {
    throw new FormError(`${label} must be a whole number.`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new FormError(`${label} must be at least ${opts.min}.`);
  }
  if (opts.max !== undefined && n > opts.max) {
    throw new FormError(`${label} must be at most ${opts.max}.`);
  }
  return n;
}

export function toErrorState(err: unknown): ActionState {
  if (err instanceof FormError) return { error: err.message };
  if (err && typeof err === "object" && "message" in err) {
    return { error: String((err as { message: unknown }).message) };
  }
  return { error: "Something went wrong." };
}
