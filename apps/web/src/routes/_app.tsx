import { Navbar } from "@/components/layout/navbar"
import { meQueryOptions } from "@/features/auth/api"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app")({
  // Auth guard for every route nested under this layout. Resolves the shared
  // `me` query (cached, so it's usually instant) and bounces unauthenticated
  // visitors to the public landing page.
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!me) throw redirect({ to: "/" })
    return { me }
  },
  component: AppLayout,
})

function AppLayout() {
  const { me } = Route.useRouteContext()

  return (
    <div className="min-h-svh">
      <Navbar user={me} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
