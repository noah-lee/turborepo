import { Button } from "@/components/ui/button"
import { signIn } from "@/features/auth/api"

export function SignInButton() {
  return <Button onClick={signIn}>Sign in with Google</Button>
}
