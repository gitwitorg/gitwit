"use client"

import { Logo } from "@/components/ui/logo"
import { ThemeSwitcher } from "@/components/ui/theme-switcher"
import UserButton from "@/components/ui/userButton"
import { Pencil } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useEditor } from "@/context/editor-context"
import { useProjectContext } from "@/context/project-context"
import DeployButtonModal from "./deploy"
import DownloadButton from "./downloadButton"
import EditSandboxModal from "./edit"
import RunButtonModal from "./run"
import ShareSandboxModal from "./share"

export default function Navbar({
  shared,
}: {
  shared: { id: string; name: string; avatarUrl: string }[]
}) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const { user, project } = useProjectContext()
  const { previewURL } = useEditor()
  const isOwner = project.userId === user.id

  return (
    <>
      <EditSandboxModal
        open={isEditOpen}
        setOpen={setIsEditOpen}
        data={project}
      />
      <ShareSandboxModal
        open={isShareOpen}
        setOpen={setIsShareOpen}
        data={project}
        shared={shared}
      />
      <div className="h-14 shrink-0 px-2 w-full flex items-center justify-between border-b border-border">
        <div className="flex items-center space-x-4">
          <Link
            href="/"
            className="ring-offset-2 transition-all ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <Logo />
          </Link>
          <div className="text-sm font-medium flex items-center">
            {project.name}
            {isOwner ? (
              <button
                onClick={() => setIsEditOpen(true)}
                className="h-7 w-7 ml-2 flex items-center justify-center bg-transparent hover:bg-muted-foreground/25 cursor-pointer rounded-md ring-offset-2 transition-all ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
        <RunButtonModal
          isRunning={!!previewURL}
          sandboxData={project}
        />
        <div className="flex items-center h-full space-x-4">
          {isOwner ? (
            <>
              <DeployButtonModal data={project} userData={user} />
              <DownloadButton name={project.name} projectId={project.id} />
            </>
          ) : null}
          <ThemeSwitcher />
          <UserButton userData={user} />
        </div>
      </div>
    </>
  )
}
