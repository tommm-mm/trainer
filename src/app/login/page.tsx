import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Trainer</h1>
      <p className="mb-8 mt-1 text-sm text-neutral-400">
        Sign in to your coach.
      </p>
      <LoginForm />
    </main>
  );
}
