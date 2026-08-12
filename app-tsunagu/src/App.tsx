import { useCallback, useEffect, useRef, useState } from 'react'
import * as PIXI from 'pixi.js'
import './App.css'

// ===== 感情データ =====
interface Emotion {
  id: string
  color: string
  bgColor: string
  label: string
  emoji: string
}

const EMOTIONS: Emotion[] = [
  { id: 'orange', color: '#ff9800', bgColor: '#ffe0b2', label: 'おなか すいた\nこれ ほしい', emoji: '🍊' },
  { id: 'blue', color: '#2196f3', bgColor: '#bbdefb', label: 'つかれた\nやすみたい', emoji: '💙' },
  { id: 'red', color: '#f44336', bgColor: '#ffcdd2', label: 'いやだ\nいらいら', emoji: '❤️' },
  { id: 'yellow', color: '#ffc107', bgColor: '#fff9c4', label: 'たのしい\nあそびたい', emoji: '💛' },
  { id: 'green', color: '#4caf50', bgColor: '#c8e6c9', label: 'うれしい\nだいすき', emoji: '💚' },
]

// ===== 音声フィードバック（Web Audio API） =====
function playTone(freq: number, duration = 0.15) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {
    // 音声が使えない場合は無視
  }
}

function App() {
  const [currentEmotion, setCurrentEmotion] = useState<Emotion | null>(null)
  const [mode, setMode] = useState<'emotion' | 'draw' | 'yesno'>('emotion')
  const [showFull, setShowFull] = useState(false)
  const [fullContent, setFullContent] = useState<{ emoji: string; label: string; color: string } | null>(null)
  const [history, setHistory] = useState<{ emoji: string; label: string; time: string }[]>([])
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])
  const rippleId = useRef(0)

  // Pixi.js 描画用
  const canvasRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const graphicsRef = useRef<PIXI.Graphics | null>(null)

  // ===== 感情選択 =====
  const selectEmotion = useCallback((emotion: Emotion) => {
    setCurrentEmotion(emotion)
    setMode('emotion')
    playTone(600)
    // 履歴に追加
    const now = new Date()
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    setHistory((prev) => [{ emoji: emotion.emoji, label: emotion.label.replace('\n', ' '), time: timeStr }, ...prev].slice(0, 20))
  }, [])

  // ===== 連打で波紋 =====
  const addRipple = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const x = clientX - rect.left
    const y = clientY - rect.top
    const id = rippleId.current++
    setRipples((prev) => [...prev, { id, x, y, size: 20 }])
    playTone(400 + Math.random() * 200, 0.1)
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id))
    }, 600)
  }, [])

  // ===== 親に見せる =====
  const showToParent = useCallback(() => {
    if (currentEmotion) {
      setFullContent({ emoji: currentEmotion.emoji, label: currentEmotion.label, color: currentEmotion.color })
      setShowFull(true)
      playTone(800, 0.3)
    }
  }, [currentEmotion])

  // ===== はい/いいえ =====
  const selectYesNo = useCallback((answer: 'yes' | 'no') => {
    const content = answer === 'yes'
      ? { emoji: '⭕', label: 'はい', color: '#4caf50' }
      : { emoji: '❌', label: 'いいえ', color: '#f44336' }
    setFullContent(content)
    setShowFull(true)
    playTone(answer === 'yes' ? 700 : 300, 0.3)
    const now = new Date()
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    setHistory((prev) => [{ emoji: content.emoji, label: content.label, time: timeStr }, ...prev].slice(0, 20))
  }, [])

  // ===== Pixi.js お絵かき初期化 =====
  useEffect(() => {
    if (mode !== 'draw' || !canvasRef.current) return

    const app = new PIXI.Application()
    appRef.current = app

    const init = async () => {
      await app.init({
        width: canvasRef.current!.clientWidth,
        height: canvasRef.current!.clientHeight,
        backgroundColor: 0xffffff,
        antialias: true,
      })
      canvasRef.current!.appendChild(app.canvas)

      const graphics = new PIXI.Graphics()
      graphics.lineStyle(12, 0x5c7cfa, 1)
      app.stage.addChild(graphics)
      graphicsRef.current = graphics

      // タッチ/マウスイベント
      const canvas = app.canvas
      const getPos = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect()
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }
      }

      canvas.addEventListener('pointerdown', (e) => {
        drawingRef.current = true
        const pos = getPos(e)
        lastPointRef.current = pos
        graphics.moveTo(pos.x, pos.y)
        playTone(500, 0.05)
      })

      canvas.addEventListener('pointermove', (e) => {
        if (!drawingRef.current || !lastPointRef.current) return
        const pos = getPos(e)
        graphics.lineTo(pos.x, pos.y)
        graphics.stroke()
        graphics.lineStyle(12, 0x5c7cfa, 1)
        graphics.moveTo(pos.x, pos.y)
        lastPointRef.current = pos
      })

      const stop = () => {
        drawingRef.current = false
        lastPointRef.current = null
      }
      canvas.addEventListener('pointerup', stop)
      canvas.addEventListener('pointerleave', stop)
    }

    init()

    return () => {
      app.destroy(true)
      appRef.current = null
      graphicsRef.current = null
    }
  }, [mode])

  // ===== お絵かきクリア =====
  const clearDrawing = useCallback(() => {
    if (graphicsRef.current) {
      graphicsRef.current.clear()
    }
  }, [])

  // ===== お絵かきを親に見せる =====
  const showDrawingToParent = useCallback(() => {
    setFullContent({ emoji: '🎨', label: 'えを かいたよ！', color: '#5c7cfa' })
    setShowFull(true)
    playTone(800, 0.3)
  }, [])

  return (
    <div className="app" style={{ background: currentEmotion ? currentEmotion.bgColor : '#fff8e1' }}>
      {/* ヘッダー */}
      <div className="header">
        <button className="mode-btn" onClick={() => setMode('emotion')} style={{ background: currentEmotion?.color || '#ff6b6b' }}>
          😊 きもち
        </button>
        <button className="mode-btn" onClick={() => setMode('draw')} style={{ background: '#5c7cfa' }}>
          ✏️ おえかき
        </button>
        <button className="mode-btn" onClick={() => setMode('yesno')} style={{ background: '#ffa726' }}>
          ⭕❌ はい・いいえ
        </button>
      </div>

      {/* メインエリア */}
      <div className="main-area" onPointerDown={mode === 'emotion' && currentEmotion ? addRipple : undefined}>
        {mode === 'emotion' && (
          <>
            {currentEmotion ? (
              <div className="emotion-display">
                <div className="emotion-emoji">{currentEmotion.emoji}</div>
                <div className="emotion-label" style={{ color: currentEmotion.color }}>
                  {currentEmotion.label.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
                <div className="hint">タップすると おおきくなるよ！</div>
              </div>
            ) : (
              <div className="emotion-display">
                <div className="emotion-emoji">😊</div>
                <div className="emotion-label" style={{ color: '#ff6b6b' }}>
                  <div>きもちを</div>
                  <div>えらんでね！</div>
                </div>
              </div>
            )}
            {/* 波紋エフェクト */}
            {ripples.map((r) => (
              <div
                key={r.id}
                className="ripple"
                style={{
                  left: r.x,
                  top: r.y,
                  borderColor: currentEmotion?.color || '#ff6b6b',
                  animation: `ripple 0.6s ease-out forwards`,
                }}
              />
            ))}
          </>
        )}

        {mode === 'draw' && (
          <div className="draw-area">
            <div className="draw-canvas" ref={canvasRef} />
            <div className="draw-tools">
              <button className="tool-btn" onClick={clearDrawing}>🧹 けす</button>
              <button className="tool-btn" onClick={showDrawingToParent}>📢 みせる</button>
            </div>
          </div>
        )}

        {mode === 'yesno' && (
          <div className="yesno-area">
            <button className="yesno-btn yes" onClick={() => selectYesNo('yes')}>
              <div className="yesno-emoji">⭕</div>
              <div className="yesno-text">はい</div>
            </button>
            <button className="yesno-btn no" onClick={() => selectYesNo('no')}>
              <div className="yesno-emoji">❌</div>
              <div className="yesno-text">いいえ</div>
            </button>
          </div>
        )}
      </div>

      {/* 感情パレット */}
      <div className="palette">
        {EMOTIONS.map((emotion) => (
          <button
            key={emotion.id}
            className="palette-btn"
            style={{ background: emotion.color }}
            onClick={() => selectEmotion(emotion)}
          >
            {emotion.emoji}
          </button>
        ))}
      </div>

      {/* 親に見せるボタン */}
      <button className="parent-btn" onClick={showToParent}>
        📢 おとなに みせる
      </button>

      {/* 履歴 */}
      {history.length > 0 && (
        <div className="history">
          <div className="history-title">きょうの きろく</div>
          <div className="history-list">
            {history.map((h, i) => (
              <div key={i} className="history-item">
                <span>{h.emoji}</span>
                <span>{h.label}</span>
                <span className="history-time">{h.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* フルスクリーン表示（親に見せる） */}
      {showFull && fullContent && (
        <div className="fullscreen" style={{ background: fullContent.color }} onClick={() => setShowFull(false)}>
          <div className="fullscreen-emoji">{fullContent.emoji}</div>
          <div className="fullscreen-label">{fullContent.label}</div>
          <div className="fullscreen-hint">タップで もどる</div>
        </div>
      )}
    </div>
  )
}

export default App
