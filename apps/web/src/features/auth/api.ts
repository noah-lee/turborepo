import { api, fetchJson } from "@/lib/api"
import { type MeResponse, meResponseSchema } from "@repo/shared/schemas"
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import axios from "axios"

export const ME_QUERY_KEY = ["auth", "me"] as const

// Shared so the router's auth guard (beforeLoad) and the useMe() hook read the
// same cache entry. Returns null on 401 rather than throwing, so an
// unauthenticated user is a normal state, not an error.
export const meQueryOptions = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await fetchJson("/auth/me", meResponseSchema)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return null
      throw err
    }
  },
  retry: false,
  staleTime: 5 * 60 * 1000,
})

export function useMe() {
  return useQuery(meQueryOptions)
}

export function signIn() {
  window.location.href = "/api/auth/google/start"
}

export function useSignOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  })
}

export function useSignOutEverywhere() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post("/auth/logout-all"),
    onSettled: () => qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  })
}
