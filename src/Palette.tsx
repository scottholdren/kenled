import { useRef } from 'react'

interface Props {
  palette: string[]
  selected: number
  onSelect: (index: number) => void
  onEditColor: (index: number, color: string) => void
}

function Palette({ palette, selected, onSelect, onEditColor }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null)

  return (
    <div className="palette">
      {palette.map((color, i) => (
        <button
          key={i}
          className={i === selected ? 'swatch selected' : 'swatch'}
          style={{ background: color }}
          title={i === 0 ? `${i}: off` : `${i}: ${color}`}
          onClick={() => onSelect(i)}
        >
          {i === 0 && <span className="swatch-off">off</span>}
          {i === selected && i !== 0 && (
            <span
              className="swatch-edit"
              title="Edit color"
              onClick={(e) => {
                e.stopPropagation()
                pickerRef.current?.click()
              }}
            >
              ✎
            </span>
          )}
        </button>
      ))}
      {/* Hidden picker, always bound to the selected swatch */}
      <input
        ref={pickerRef}
        type="color"
        className="picker"
        value={palette[selected]}
        onChange={(e) => onEditColor(selected, e.target.value)}
      />
    </div>
  )
}

export default Palette
