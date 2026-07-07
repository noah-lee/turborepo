import { Button } from "@/components/ui/button";
import { useMe, useSignOut, useSignOutEverywhere } from "@/features/auth/api";
import { SignInButton } from "@/features/auth/sign-in-button";
import {
  usePortal,
  useStartSubscription,
  useSyncBilling,
} from "@/features/billing/api";
import { fetchJson } from "@/lib/api";
import type { MeResponse } from "@repo/shared/schemas";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

const healthSchema = z.object({ status: z.string() });
type HealthResponse = z.infer<typeof healthSchema>;

type CheckoutBanner =
  | { kind: "success"; message: string }
  | { kind: "canceled"; message: string }
  | null;

function readCheckoutParam(): CheckoutBanner {
  const value = new URLSearchParams(window.location.search).get("checkout");
  if (value === "success") {
    return { kind: "success", message: "Checkout complete — refreshing…" };
  }
  if (value === "canceled") {
    return { kind: "canceled", message: "Checkout canceled." };
  }
  return null;
}

function stripCheckoutParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  window.history.replaceState(null, "", url.toString());
}

function useCheckoutQueryParam() {
  const [banner, setBanner] = useState<CheckoutBanner>(() =>
    readCheckoutParam(),
  );
  const sync = useSyncBilling();

  // sync.mutate is stable; banner is the only trigger we care about.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — see above
  useEffect(() => {
    if (!banner) return;
    if (banner.kind === "success") sync.mutate();
    stripCheckoutParam();
    const t = window.setTimeout(() => setBanner(null), 4000);
    return () => window.clearTimeout(t);
  }, [banner]);

  return banner;
}

export function App() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!me.data) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <SignInButton />
      </div>
    );
  }
  return <SignedIn user={me.data} />;
}

function SignedIn({ user }: { user: MeResponse }) {
  const banner = useCheckoutQueryParam();
  const apiCheck = useQuery({
    queryKey: ["health", "api"],
    queryFn: () => fetchJson("/health", healthSchema),
  });
  const dbCheck = useQuery({
    queryKey: ["health", "db"],
    queryFn: () => fetchJson("/health/db", healthSchema),
  });
  const signOut = useSignOut();
  const signOutEverywhere = useSignOutEverywhere();
  const startSubscription = useStartSubscription();
  const portal = usePortal();

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div className="flex items-center gap-3">
          {user.picture && (
            <img
              src={user.picture}
              alt=""
              className="size-9 rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {user.name ?? user.email}
              {user.isPremium && (
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  Premium
                </span>
              )}
            </p>
            {user.name && (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </div>
        {banner && (
          <div className="rounded border px-3 py-2 text-xs text-muted-foreground">
            {banner.message}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Check label="API" query={apiCheck} />
          <Check label="DB" query={dbCheck} />
        </div>
        <div className="flex flex-wrap gap-2">
          {user.isPremium ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                portal.mutate(undefined, {
                  onSuccess: ({ url }) => {
                    window.location.href = url;
                  },
                })
              }
              disabled={portal.isPending}
            >
              Manage billing
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                startSubscription.mutate(undefined, {
                  onSuccess: ({ url }) => {
                    window.location.href = url;
                  },
                })
              }
              disabled={startSubscription.isPending}
            >
              Upgrade to Premium
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            Sign out
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => signOutEverywhere.mutate()}
            disabled={signOutEverywhere.isPending}
          >
            Sign out everywhere
          </Button>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  );
}

function Check({
  label,
  query,
}: {
  label: string;
  query: UseQueryResult<HealthResponse>;
}) {
  const status = query.isFetching
    ? "checking…"
    : query.isError
      ? "error"
      : (query.data?.status ?? "—");

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0">{label}:</span>
      <span className="flex-1 font-mono text-xs">{status}</span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => query.refetch()}
        disabled={query.isFetching}
      >
        Check
      </Button>
    </div>
  );
}

export default App;
