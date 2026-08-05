import type { Design } from './types.ts'

// Where the wall's animation lives. The `wall` branch keeps publishes from
// triggering app redeploys; the dongle polls the raw URL for this file.
const OWNER = 'scottholdren'
const REPO = 'kenled'
const FILE = 'current.json'
const BRANCH = 'wall'

const TOKEN_KEY = 'kenled.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token.trim())
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export const TOKEN_HELP_URL = 'https://github.com/settings/personal-access-tokens/new'

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Commit the design as current.json on the wall branch. Throws with a readable message. */
export async function publishDesign(design: Design, token: string): Promise<void> {
  const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  // Updating an existing file requires its current blob sha.
  let sha: string | undefined
  const probe = await fetch(`${api}?ref=${BRANCH}`, { headers })
  if (probe.ok) {
    sha = ((await probe.json()) as { sha: string }).sha
  } else if (probe.status === 401 || probe.status === 403) {
    throw new Error('Token rejected — check it has contents access to the kenled repo.')
  } else if (probe.status !== 404) {
    throw new Error(`GitHub error ${probe.status} while checking the wall.`)
  }

  const put = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Publish "${design.name.trim() || 'untitled'}" to wall`,
      branch: BRANCH,
      content: toBase64(JSON.stringify(design, null, 2)),
      ...(sha === undefined ? {} : { sha }),
    }),
  })
  if (!put.ok) {
    if (put.status === 401 || put.status === 403) {
      throw new Error('Token rejected — it needs contents read/write on the kenled repo.')
    }
    throw new Error(`GitHub error ${put.status} while publishing.`)
  }
}
