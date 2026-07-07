import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useMe } from "@/features/auth/api"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
})

const placeholders = [
  { title: "Getting started", body: "Replace these cards with your app." },
  { title: "Your data", body: "Fetch from the API with TanStack Query." },
  { title: "Next steps", body: "Add routes under src/routes to grow." },
]

function Dashboard() {
  const me = useMe()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {me.data?.name ?? "there"}.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {placeholders.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.body}</CardDescription>
            </CardHeader>
            <CardContent className="h-16 rounded-2xl bg-muted/40" />
          </Card>
        ))}
      </div>
    </div>
  )
}
