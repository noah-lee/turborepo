import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { DeleteAccountCard } from "@/features/account/delete-account"
import { useMe } from "@/features/auth/api"
import { BillingCard } from "@/features/billing/billing-card"
import type { MeResponse } from "@repo/shared/schemas"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/profile")({
  component: Profile,
})

function Profile() {
  const me = useMe()
  if (!me.data) return null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold">Profile</h1>
      <IdentityCard user={me.data} />
      <BillingCard />
      <DeleteAccountCard />
    </div>
  )
}

function IdentityCard({ user }: { user: MeResponse }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <Avatar size="lg">
          {user.picture && (
            <AvatarImage
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
            />
          )}
          <AvatarFallback>
            {(user.name ?? user.email).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{user.name ?? user.email}</span>
            {user.isPremium && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                Premium
              </span>
            )}
          </p>
          {user.name && (
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
