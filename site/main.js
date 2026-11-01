// The page works without this script: the download buttons already link to the latest release's
// page. This points them straight at the .dmg and shows the version, and tells Windows visitors that a
// Windows version is on its way.
const REPO = 'holotrek/folk-dance-player'
const CACHE_KEY = 'fdp-latest-release'
const CACHE_MS = 10 * 60 * 1000

function readCache() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY))
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.release
  } catch {
    // Storage can be unavailable; just ask GitHub.
  }
  return null
}

function writeCache(release) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }))
  } catch {
    // Not worth failing over.
  }
}

async function latestRelease() {
  const cached = readCache()
  if (cached) return cached
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  const data = await response.json()
  const dmg = data.assets.find((asset) => asset.name.endsWith('.dmg'))
  if (!dmg) throw new Error('The latest release has no .dmg')
  const release = {
    version: String(data.tag_name).replace(/^v/, ''),
    url: dmg.browser_download_url
  }
  writeCache(release)
  return release
}

if (/windows/i.test(navigator.userAgent)) {
  for (const note of document.querySelectorAll('[data-windows-note]')) note.hidden = false
}

latestRelease()
  .then(({ version, url }) => {
    for (const link of document.querySelectorAll('[data-download]')) link.href = url
    for (const line of document.querySelectorAll('[data-version-line]')) {
      line.textContent = `Version ${version}`
      line.hidden = false
    }
  })
  .catch(() => {
    // The buttons keep linking to the Releases page.
  })
