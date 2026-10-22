import {
  type CreateFileBody,
  createFileResponseSchema,
  downloadUrlResponseSchema,
  type FileItem,
  fileListResponseSchema,
  fileSchema,
} from "@repo/shared/schemas"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { api, fetchJson } from "@/lib/api"

const FILES_QUERY_KEY = ["files"] as const

export function useFiles() {
  return useQuery({
    queryKey: FILES_QUERY_KEY,
    queryFn: async () =>
      (await fetchJson("/files", fileListResponseSchema)).files,
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Register, PUT the bytes straight to the bucket, then have the api confirm the object.
async function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<FileItem> {
  const body: CreateFileBody = {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  }
  const target = createFileResponseSchema.parse(
    (await api.post("/files", body)).data,
  )

  // Plain axios, not `api`: the bucket is another origin and must get no cookies.
  await axios.put(target.uploadUrl, file, {
    headers: target.headers,
    onUploadProgress: (event) => {
      if (event.total)
        onProgress(Math.round((event.loaded / event.total) * 100))
    },
  })

  const complete = () => api.post(`/files/${target.fileId}/complete`)
  try {
    return fileSchema.parse((await complete()).data)
  } catch (err) {
    // The bucket can take a moment to show a new object; one retry, then give up.
    if (!axios.isAxiosError(err) || err.response?.status !== 409) throw err
    await sleep(1000)
    return fileSchema.parse((await complete()).data)
  }
}

export function useUploadFile(onProgress: (percent: number) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadFile(file, onProgress),
    onSettled: () => qc.invalidateQueries({ queryKey: FILES_QUERY_KEY }),
  })
}

export function useDownloadFile() {
  return useMutation({
    mutationFn: async (fileId: string) => {
      const { url } = await fetchJson(
        `/files/${fileId}/download`,
        downloadUrlResponseSchema,
      )
      // The bucket answers as an attachment, so the browser saves it and stays here.
      window.location.assign(url)
    },
  })
}

export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) => api.delete(`/files/${fileId}`),
    onSettled: () => qc.invalidateQueries({ queryKey: FILES_QUERY_KEY }),
  })
}
