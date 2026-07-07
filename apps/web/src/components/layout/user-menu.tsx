import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSignOut, useSignOutEverywhere } from "@/features/auth/api"
import type { MeResponse } from "@repo/shared/schemas"
import { Link, useNavigate } from "@tanstack/react-router"
import { LogOut, User } from "lucide-react"

function initials(user: MeResponse) {
  const source = user.name ?? user.email
  return source.slice(0, 2).toUpperCase()
}

/** Avatar trigger + dropdown with account links and sign-out actions. */
export function UserMenu({ user }: { user: MeResponse }) {
  const navigate = useNavigate()
  const signOut = useSignOut()
  const signOutEverywhere = useSignOutEverywhere()

  const toHome = { onSuccess: () => navigate({ to: "/" }) }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
        <Avatar>
          {user.picture && (
            <AvatarImage
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
            />
          )}
          <AvatarFallback>{initials(user)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">
            {user.name ?? user.email}
          </span>
          {user.name && <span className="truncate">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => signOut.mutate(undefined, toHome)}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => signOutEverywhere.mutate(undefined, toHome)}
        >
          <LogOut />
          Sign out everywhere
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
