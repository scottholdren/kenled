import { useState } from 'react'
import { createDesign, type Design } from './types.ts'
import { DEFAULT_PALETTE } from './palette.ts'
import SetupScreen from './SetupScreen.tsx'
import Editor from './Editor.tsx'

function App() {
  const [design, setDesign] = useState<Design | null>(null)

  if (design === null) {
    return <SetupScreen onCreate={(cols, rows) => setDesign(createDesign(cols, rows, DEFAULT_PALETTE))} />
  }

  return <Editor design={design} onChange={setDesign} onNewProject={() => setDesign(null)} />
}

export default App
