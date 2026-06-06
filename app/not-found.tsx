import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0d0d0d] px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a1a]">
        <Compass className="h-6 w-6 text-[#F9E400]" />
      </span>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Page not found</h1>
        <p className="max-w-sm text-sm text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="flex h-10 items-center rounded-lg bg-[#F9E400] px-4 text-sm font-semibold text-black transition hover:bg-[#F9E400]/90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
