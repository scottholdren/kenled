import type { Design } from './types.ts'
import { validateDesign } from './storage.ts'

function toBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64url(s: string): Uint8Array {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** The design, deflate-compressed and base64url-encoded into a URL fragment. */
export async function designToShareUrl(design: Design): Promise<string> {
  const stream = new Blob([JSON.stringify(design)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const buf = await new Response(stream).arrayBuffer()
  return `${location.origin}${location.pathname}#a=${toBase64url(buf)}`
}

/** Decode a design from a share-link hash. Returns null for anything invalid. */
export async function designFromHash(hash: string): Promise<Design | null> {
  if (!hash.startsWith('#a=')) return null
  try {
    const bytes = fromBase64url(hash.slice(3))
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const json = await new Response(stream).text()
    return validateDesign(JSON.parse(json))
  } catch {
    return null
  }
}
