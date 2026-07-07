import { useSyncBilling } from "@/features/billing/api"
import { useEffect, useState } from "react"

export type CheckoutBanner =
  | { kind: "success"; message: string }
  | { kind: "canceled"; message: string }
  | null

function readCheckoutParam(): CheckoutBanner {
  const value = new URLSearchParams(window.location.search).get("checkout")
  if (value === "success") {
    return { kind: "success", message: "Checkout complete — refreshing…" }
  }
  if (value === "canceled") {
    return { kind: "canceled", message: "Checkout canceled." }
  }
  return null
}

function stripCheckoutParam() {
  const url = new URL(window.location.href)
  url.searchParams.delete("checkout")
  window.history.replaceState(null, "", url.toString())
}

/**
 * Stripe redirects back to `/?checkout=success|canceled` after checkout. This
 * hook lives at the app root (mounted on every route) so the result is handled
 * wherever the user lands: on success it re-syncs billing state, then clears the
 * query param and auto-dismisses the banner.
 */
export function useCheckoutBanner(): CheckoutBanner {
  const [banner, setBanner] = useState<CheckoutBanner>(() =>
    readCheckoutParam(),
  )
  const sync = useSyncBilling()

  // sync.mutate is stable; banner is the only trigger we care about.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — see above
  useEffect(() => {
    if (!banner) return
    if (banner.kind === "success") sync.mutate()
    stripCheckoutParam()
    const t = window.setTimeout(() => setBanner(null), 4000)
    return () => window.clearTimeout(t)
  }, [banner])

  return banner
}
