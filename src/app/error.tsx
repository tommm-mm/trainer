"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-neutral-400">{error.message}</p>
      <button
        onClick={reset}
        className="self-start rounded-lg border border-neutral-700 px-3 py-2 text-sm"
      >
        Try again
      </button>
    </main>
  );
}
