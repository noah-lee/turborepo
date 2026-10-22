import { type FileItem, MAX_FILE_BYTES } from "@repo/shared/schemas"
import { Download, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  useDeleteFile,
  useDownloadFile,
  useFiles,
  useUploadFile,
} from "@/features/files/api"

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function FilesSection() {
  const files = useFiles()
  const [percent, setPercent] = useState(0)
  const upload = useUploadFile(setPercent)
  const inputRef = useRef<HTMLInputElement>(null)

  function choose(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`Files can be up to ${formatBytes(MAX_FILE_BYTES)}.`)
      return
    }
    if (file.size === 0) {
      toast.error("That file is empty.")
      return
    }
    setPercent(0)
    upload.mutate(file, {
      onError: () => toast.error("Upload failed. Try again."),
    })
  }

  return (
    <section aria-labelledby="files" className="flex flex-col gap-3 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="files" className="text-sm font-medium text-muted-foreground">
          Files
        </h2>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            choose(event.target.files?.[0])
            // Lets the same file be picked again after a failure.
            event.target.value = ""
          }}
        />
        <Button
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Upload data-icon="inline-start" />
          )}
          Upload file
        </Button>
      </div>

      {upload.isPending && (
        <Item variant="outline" size="sm">
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">
              {upload.variables.name}
            </ItemTitle>
            <Progress value={percent} aria-label="Upload progress" />
          </ItemContent>
        </Item>
      )}

      {files.isPending ? (
        <Skeleton className="h-16 w-full rounded-2xl" />
      ) : files.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn't load your files.
        </p>
      ) : files.data.length === 0 ? (
        !upload.isPending && (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        )
      ) : (
        <ItemGroup aria-label="Your files">
          {files.data.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </ItemGroup>
      )}
    </section>
  )
}

function FileRow({ file }: { file: FileItem }) {
  const download = useDownloadFile()
  const remove = useDeleteFile()

  return (
    <Item role="listitem" variant="outline" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate" title={file.fileName}>
          {file.fileName}
        </ItemTitle>
        <ItemDescription>
          {formatBytes(file.sizeBytes)} · {formatDate(file.uploadedAt)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          aria-label={`Download ${file.fileName}`}
          disabled={download.isPending}
          onClick={() =>
            download.mutate(file.id, {
              onError: () => toast.error("Couldn't start the download."),
            })
          }
        >
          {download.isPending ? <Spinner /> : <Download />}
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          aria-label={`Delete ${file.fileName}`}
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(file.id, {
              onError: () => toast.error("Couldn't delete the file."),
            })
          }
        >
          {remove.isPending ? <Spinner /> : <Trash2 />}
        </Button>
      </ItemActions>
    </Item>
  )
}
