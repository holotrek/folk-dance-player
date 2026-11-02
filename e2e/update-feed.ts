import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'

// A local update feed (updates spec §8, layer 3): serves the feed file and the file it names, the
// way a GitHub release does, so the app's real check and download can be watched. Windows reads
// latest.yml and downloads the installer; macOS reads latest-mac.yml and downloads the zip.
export const FEED_NAME = process.platform === 'win32' ? 'latest.yml' : 'latest-mac.yml'
export const assetName = (version: string): string =>
  process.platform === 'win32'
    ? `Folk-Dance-Player-Setup-${version}.exe`
    : `Folk-Dance-Player-${version}-universal.zip`
export interface Feed {
  url: string
  requests: string[] // the paths asked for, in order
  close(): Promise<void>
}

export async function serveFeed(options: {
  version: string
  zip?: Buffer
  // A checksum other than the zip's, to make the download fail its check.
  sha512?: string
}): Promise<Feed> {
  const name = assetName(options.version)
  // Different bytes each time: the updater keeps what it downloaded, and would skip the download.
  const zip = options.zip ?? randomBytes(64 * 1024)
  const sha512 = options.sha512 ?? createHash('sha512').update(zip).digest('base64')
  const yml = `version: ${options.version}
files:
  - url: ${name}
    sha512: ${sha512}
    size: ${zip.length}
path: ${name}
sha512: ${sha512}
releaseDate: '2026-11-01T00:00:00.000Z'
`
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    requests.push(path)
    if (path === `/${FEED_NAME}`) {
      res.writeHead(200, { 'Content-Type': 'text/yaml' }).end(yml)
    } else if (path === `/${name}`) {
      res
        .writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': zip.length
        })
        .end(zip)
    } else {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
