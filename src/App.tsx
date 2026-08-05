import { useState } from 'react'
import { createDesign, type Design } from './types.ts'
import { DEFAULT_PALETTE } from './palette.ts'
import {
  deleteProject,
  listProjects,
  loadCurrent,
  loadProject,
  newId,
  saveProject,
  setCurrent,
  type ProjectSummary,
} from './storage.ts'
import SetupScreen from './SetupScreen.tsx'
import Editor from './Editor.tsx'

interface OpenProject {
  id: string
  design: Design
}

function App() {
  const [project, setProject] = useState<OpenProject | null>(() => loadCurrent())
  const [projects, setProjects] = useState<ProjectSummary[]>(() => listProjects())

  const openDesign = (id: string, design: Design) => {
    saveProject(id, design)
    setProject({ id, design })
  }

  if (project === null) {
    return (
      <SetupScreen
        projects={projects}
        onCreate={(cols, rows) => openDesign(newId(), createDesign(cols, rows, DEFAULT_PALETTE))}
        onImport={(design) => openDesign(newId(), design)}
        onOpen={(id) => {
          const design = loadProject(id)
          if (design !== null) openDesign(id, design)
        }}
        onDelete={(id) => {
          deleteProject(id)
          setProjects(listProjects())
        }}
      />
    )
  }

  return (
    <Editor
      design={project.design}
      onChange={(design) => {
        saveProject(project.id, design)
        setProject({ ...project, design })
      }}
      onNewProject={() => {
        setCurrent(null)
        setProjects(listProjects())
        setProject(null)
      }}
    />
  )
}

export default App
