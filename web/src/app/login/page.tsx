import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="font-serif text-2xl mb-10 text-ink-fg">
        Inkwell
      </Link>
      <h1 className="text-lg font-medium mb-6">Sign in to your private journal</h1>
      <AuthForm />
      <p className="mt-8 max-w-sm text-center text-xs text-ink-muted">
        Your entries are stored only in your account. We never use your writing
        to train models.
      </p>
    </div>
  );
}
