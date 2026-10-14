import { createHash } from 'crypto'
import { open } from 'fs/promises'

const CHUNK = 1024 * 1024

// Spec §4: a fast fingerprint — file size plus the first and last 1 MB — used to recognize a
// file that was moved or renamed without re-hashing whole files.
export async function contentHash(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const hash = createHash('sha256').update(`${size}:`)
    const read = async (position: number, length: number): Promise<void> => {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, position)
      hash.update(buffer.subarray(0, bytesRead))
    }
    await read(0, Math.min(CHUNK, size))
    if (size > CHUNK) await read(Math.max(CHUNK, size - CHUNK), Math.min(CHUNK, size - CHUNK))
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}
