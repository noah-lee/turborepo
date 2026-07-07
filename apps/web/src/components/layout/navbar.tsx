import { ModeToggle } from "@/components/layout/mode-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import type { MeResponse } from "@repo/shared/schemas"
import { Link } from "@tanstack/react-router"

/** Top navigation bar for the authenticated app shell. */
export function Navbar({ user }: { user: MeResponse }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
        <Link to="/dashboard" className="font-heading text-base font-semibold">
          turborepo
        </Link>
        <nav className="flex items-center gap-1">
          <ModeToggle />
          <UserMenu user={user} />
        </nav>
      </div>
    </header>
  )
}
