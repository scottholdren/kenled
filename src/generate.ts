import Anthropic from '@anthropic-ai/sdk'
import type { Design } from './types.ts'
import { validateDesign } from './storage.ts'

// Describe-an-animation: the browser calls the Anthropic API directly with the
// user's own key (never sent anywhere but api.anthropic.com). Structured
// outputs pin the response to our animation JSON; validateDesign is still the
// final gate before anything touches the editor.

const KEY = 'kenled.anthropic'

export function getApiKey(): string | null {
  return localStorage.getItem(KEY)
}

export function setApiKey(key: string) {
  localStorage.setItem(KEY, key.trim())
}

export function clearApiKey() {
  localStorage.removeItem(KEY)
}

export const API_KEY_HELP_URL = 'https://platform.claude.com/settings/keys'

export interface GenTurn {
  role: 'user' | 'assistant'
  content: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'short-kebab-case animation name' },
    cols: { type: 'integer' },
    rows: { type: 'integer' },
    frameDurationMs: { type: 'integer' },
    palette: {
      type: 'array',
      items: { type: 'string', description: 'hex color like #rrggbb' },
      description: 'exactly 16 hex colors; index 0 must be #000000 (off)',
    },
    frames: {
      type: 'array',
      items: {
        type: 'array',
        items: { type: 'integer', description: 'palette index 0-15' },
      },
      description: 'each frame is exactly cols*rows palette indices, row-major',
    },
  },
  required: ['name', 'cols', 'rows', 'frameDurationMs', 'palette', 'frames'],
} as const

function systemPrompt(cols: number, rows: number): string {
  return `You design pixel animations for a physical LED wall — a grid of glass bricks, each lit by one diffused RGB LED. Animations loop forever.

Hard requirements:
- Grid is exactly ${cols} columns x ${rows} rows. cols=${cols}, rows=${rows}.
- Each frame is exactly ${cols * rows} integers (palette indices 0-15), row-major, top-left origin.
- palette: exactly 16 entries, "#rrggbb" lowercase hex. Index 0 MUST be "#000000" and means "LED off". Choose the other 15 to suit the animation.
- 2 to 48 frames, but default to 12-20 — every extra frame slows generation, and short seamless loops usually read better on a wall. Use more only when the motion truly needs them or the user asks. frameDurationMs between 30 and 2000 (per-frame timing; pick what suits the motion).

Design guidance:
- This is physical light art viewed across a room: favor bold shapes, high contrast, and saturated colors — subtle gradients get lost in the diffusion.
- Make loops seamless: the last frame should flow into the first with no visible jump.
- Prefer generating frames from a coherent motion idea (sweep, orbit, pulse, scroll, physics) rather than random noise, unless noise is requested.
- When the user asks for adjustments, keep everything they didn't ask to change.`
}

/** Trim history so requests stay small: keep the most recent turns, always
 * starting on a user turn. The latest assistant JSON carries the full
 * animation state, so old turns are safe to drop. */
export function trimHistory(history: GenTurn[]): GenTurn[] {
  const MAX = 9
  let trimmed = history.slice(-MAX)
  while (trimmed.length > 0 && trimmed[0].role !== 'user') trimmed = trimmed.slice(1)
  return trimmed
}

export async function generateAnimation(
  apiKey: string,
  cols: number,
  rows: number,
  history: GenTurn[],
  onProgress?: (bytesReceived: number) => void,
): Promise<{ design: Design; raw: string }> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 32000,
    system: systemPrompt(cols, rows),
    messages: trimHistory(history),
    // medium effort: big latency win, and animation JSON doesn't need max depth
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
  })

  let bytes = 0
  stream.on('text', (delta) => {
    bytes += delta.length
    onProgress?.(bytes)
  })

  const msg = await stream.finalMessage()

  if (msg.stop_reason === 'refusal') {
    throw new Error('Claude declined this prompt — try describing the animation differently.')
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('Ran out of output room — ask for fewer frames or a simpler animation.')
  }

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Claude returned unparseable output — try again.')
  }

  const design = validateDesign({ ...(parsed as object), version: 1 })
  if (design === null) {
    throw new Error('Claude returned an invalid animation (wrong grid or palette shape) — try again.')
  }
  return { design, raw }
}
