import { createFileRoute, Link } from "@tanstack/react-router"
import { CircleAlert, CreditCard, KeyRound, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { PageLayout } from "@/components/layout/page-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { useMe } from "@/features/auth/api"
import { SignInButton } from "@/features/auth/sign-in-button"
import { site } from "@/lib/site"

export const Route = createFileRoute("/")({
  // The API's OAuth callback sends any failure back here as `?error=oauth`.
  validateSearch: z.object({ error: z.string().optional() }),
  component: Landing,
})

// Placeholder copy: describe the product here.
const FEATURES = [
  {
    icon: KeyRound,
    title: "Sign in with Google",
    description: "No passwords to manage. Sessions stay signed in for a week.",
  },
  {
    icon: CreditCard,
    title: "Simple billing",
    description: "Upgrade or manage your subscription from your account.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    description: "Your data is yours. No ads and no tracking.",
  },
] as const

function Landing() {
  const me = useMe()
  const { error } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [showError, setShowError] = useState(Boolean(error))

  // Drop `?error` once read, so a reload or coming back from Google doesn't show a stale banner.
  useEffect(() => {
    if (error) navigate({ search: {}, replace: true })
  }, [error, navigate])

  return (
    <PageLayout className="gap-10 sm:gap-14">
      <section className="flex flex-col gap-4 sm:items-center sm:pt-10 sm:text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          {site.tagline}
        </h1>
        <p className="text-base text-pretty text-muted-foreground sm:max-w-xl sm:text-lg">
          {site.description}
        </p>

        {showError && (
          <Alert variant="destructive" className="sm:max-w-sm">
            <CircleAlert />
            <AlertDescription>
              Sign-in didn't complete. Try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Reserve the button's height while `me` loads, so the page doesn't jump. */}
        <div className="flex min-h-10 flex-col pt-2 sm:flex-row sm:justify-center">
          {me.data ? (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/account">Go to your account</Link>
            </Button>
          ) : (
            !me.isLoading && (
              <SignInButton
                size="lg"
                className="w-full sm:w-auto"
                onStart={() => setShowError(false)}
              />
            )
          )}
        </div>
      </section>

      <section aria-label="Features">
        <ItemGroup className="gap-3 sm:grid sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Item
              key={title}
              variant="outline"
              className="sm:flex-col sm:items-start"
            >
              <ItemMedia variant="icon">
                <Icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{title}</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {description}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </section>
    </PageLayout>
  )
}
