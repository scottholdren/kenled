// Client-side passphrase gate. Honest scope: this deters casual visitors —
// the app is a public static site, so it is NOT real security. The things
// that matter are protected elsewhere: publishing requires a GitHub token,
// and designs live only in each user's own browser.
//
// To change the passphrase, replace GATE_HASH with the SHA-256 of the new
// one:  node -e "console.log(require('crypto').createHash('sha256').update('newpass').digest('hex'))"

export const GATE_HASH = '8452c9eeb8117b807691a0fee7b7583c8bda8e76388e15a6589d41d95dd5ab52'

const KEY = 'kenled.gate'

export function isUnlocked(): boolean {
  return localStorage.getItem(KEY) === GATE_HASH
}

export function rememberUnlock() {
  localStorage.setItem(KEY, GATE_HASH)
}

export async function hashPassphrase(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
