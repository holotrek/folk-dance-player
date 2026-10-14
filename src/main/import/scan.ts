import { readdir, stat } from 'fs/promises'
import { basename, join } from 'path'
import { classifyPath } from './formats'

export interface ScanResult {
  audio: string[]
  unsupported: string[]
}

// Expands the files and folders the user picked or dropped into audio file paths. Folders are
// walked recursively; hidden entries (including macOS "._" files) and symlinked folders are
// skipped, and roots that don't exist are ignored.
export async function findAudioFiles(roots: string[]): Promise<ScanResult> {
  const audio = new Set<string>()
  const unsupported = new Set<string>()

  const consider = (path: string): void => {
    const kind = classifyPath(path)
    if (kind === 'audio') audio.add(path)
    else if (kind === 'unsupported') unsupported.add(path)
  }

  const walk = async (folder: string): Promise<void> => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) consider(path)
    }
  }

  for (const root of roots) {
    const info = await stat(root).catch(() => null)
    if (!info || basename(root).startsWith('.')) continue
    if (info.isDirectory()) await walk(root)
    else if (info.isFile()) consider(root)
  }
  return { audio: [...audio], unsupported: [...unsupported] }
}
