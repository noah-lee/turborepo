import { ModeToggle } from "@/components/layout/mode-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import { Button } from "@/components/ui/button"
import { useMe } from "@/features/auth/api"
import { SignInButton } from "@/features/auth/sign-in-button"
import { Link, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: LandingPage,
})

function LandingPage() {
  const me = useMe()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <span className="font-heading text-base font-semibold">
            turborepo
          </span>
          <nav className="flex items-center gap-2">
            <ModeToggle />
            {me.data ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <UserMenu user={me.data} />
              </>
            ) : (
              !me.isLoading && <SignInButton />
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Ship your idea this weekend
        </h1>
        <p className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
          A batteries-included starter with authentication, billing, and a typed
          API. Replace this landing page and start building.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {me.data ? (
            <Button asChild size="lg">
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            !me.isLoading && <SignInButton />
          )}
        </div>
      </main>
    </div>
  )
}
