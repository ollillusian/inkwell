import Link from "next/link";
import { HumanOnlyBanner } from "@/components/HumanOnlyBanner";

export default function LandingPage() {
  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-16 max-w-xl mx-auto">
        <p className="text-sm tracking-[0.2em] uppercase text-ink-muted mb-6">
          Private writing companion
        </p>
        <h1 className="font-serif text-5xl sm:text-6xl leading-[1.1] text-ink-fg">
          Gentle nudges when you choose — before bed, travel, spontaneous — to write{" "}
          <span className="italic text-ink-accent">as yourself</span>.
        </h1>
        <p className="mt-6 text-lg text-ink-muted leading-relaxed">
          Inkwell sends AI-tailored prompts based on what you want to explore —
          grief, hope, work, memory. Your journal stays yours: prompts from the
          model, answers from you.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className="inline-flex justify-center rounded-full bg-ink-fg text-ink-bg px-8 py-3.5 font-medium hover:opacity-90 transition-opacity"
          >
            Begin writing
          </Link>
          <Link
            href="/login"
            className="inline-flex justify-center rounded-full border border-ink-border px-8 py-3.5 text-ink-fg hover:bg-ink-surface transition-colors"
          >
            Sign in
          </Link>
        </div>
        <div className="mt-12">
          <HumanOnlyBanner />
        </div>
        <ul className="mt-12 space-y-3 text-sm text-ink-muted">
          <li>· Onboarding: choose what you want to write about</li>
          <li>· Your own nudge times — plus optional surprise moments</li>
          <li>· Sign in so your entries stay in your private account</li>
        </ul>
      </div>
      <footer className="text-center text-xs text-ink-muted pb-8">
        Inkwell · iOS & web · your text, your voice
      </footer>
    </div>
  );
}
