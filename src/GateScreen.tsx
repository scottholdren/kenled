import { useState } from 'react'
import { GATE_HASH, hashPassphrase, rememberUnlock } from './gate.ts'

interface Props {
  onUnlock: () => void
}

function GateScreen({ onUnlock }: Props) {
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  const tryUnlock = async () => {
    if ((await hashPassphrase(value)) === GATE_HASH) {
      rememberUnlock()
      onUnlock()
    } else {
      setWrong(true)
      setValue('')
    }
  }

  return (
    <main className="setup">
      <h1>KenLED</h1>
      <p className="subtitle">Enter the passphrase to open the designer</p>
      <div className="gate-row">
        <input
          type="password"
          autoFocus
          placeholder="passphrase"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setWrong(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void tryUnlock()
          }}
        />
        <button className="primary" onClick={() => void tryUnlock()}>
          Open
        </button>
      </div>
      {wrong && <p className="import-error">Not it — ask Scott.</p>}
    </main>
  )
}

export default GateScreen
