import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useMe } from "@/features/auth/api"
import {
  usePortal,
  useStartSubscription,
  useSubscription,
} from "@/features/billing/api"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

/**
 * Subscription section for the profile page. Free users see an upgrade CTA;
 * premium users see their renewal state and a link to the Stripe customer
 * portal. Both actions redirect the browser to a Stripe-hosted page.
 */
export function BillingCard() {
  const me = useMe()
  const subscription = useSubscription()
  const startSubscription = useStartSubscription()
  const portal = usePortal()

  const isPremium = me.data?.isPremium ?? false
  const sub = subscription.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>
          {isPremium
            ? "You're on the Premium plan."
            : "You're on the Free plan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPremium && sub && (
          <p className="text-sm text-muted-foreground">
            {sub.cancelAtPeriodEnd
              ? `Cancels on ${formatDate(sub.currentPeriodEnd)}.`
              : `Renews on ${formatDate(sub.currentPeriodEnd)}.`}
          </p>
        )}
        <div>
          {isPremium ? (
            <Button
              variant="outline"
              onClick={() =>
                portal.mutate(undefined, {
                  onSuccess: ({ url }) => {
                    window.location.href = url
                  },
                })
              }
              disabled={portal.isPending}
            >
              Manage billing
            </Button>
          ) : (
            <Button
              onClick={() =>
                startSubscription.mutate(undefined, {
                  onSuccess: ({ url }) => {
                    window.location.href = url
                  },
                })
              }
              disabled={startSubscription.isPending}
            >
              Upgrade to Premium
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
