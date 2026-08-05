function App() {
  return (
    <main className="hello">
      <h1>KenLED</h1>
      <p>LED matrix animation designer — deploy pipeline is live.</p>
      <div className="dots" aria-hidden="true">
        {Array.from({ length: 64 }, (_, i) => (
          <span key={i} className="dot" style={{ animationDelay: `${(i % 8) * 0.1 + Math.floor(i / 8) * 0.05}s` }} />
        ))}
      </div>
    </main>
  )
}

export default App
