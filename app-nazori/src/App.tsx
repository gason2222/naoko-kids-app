import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import gsap from 'gsap'
import './App.css'

// シンプルな効果音を Web Audio API で生成するヘルパー
function playTone(freq: number, duration = 0.15, type: OscillatorType = 'sine', volume = 0.3) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.value = volume
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
    setTimeout(() => ctx.close(), duration * 1000 + 100)
  } catch (e) {
    // 音声が使えない環境では無視
  }
}

// ===== 文字と色のセット =====
interface WordColor {
  word: string
  color: number
  colorName: string
  bgColor: number
}

const WORDS: WordColor[] = [
  { word: 'あおい', color: 0x448aff, colorName: 'あお', bgColor: 0x448aff },
  { word: 'あかい', color: 0xff5252, colorName: 'あか', bgColor: 0xff5252 },
  { word: 'きいろ', color: 0xffd740, colorName: 'きいろ', bgColor: 0xffd740 },
  { word: 'みどり', color: 0x69f0ae, colorName: 'みどり', bgColor: 0x69f0ae },
  { word: 'むらさき', color: 0xea80fc, colorName: 'むらさき', bgColor: 0xea80fc },
  { word: 'オレンジ', color: 0xffab40, colorName: 'オレンジ', bgColor: 0xffab40 },
  { word: 'うれしい', color: 0xffd740, colorName: 'うれしい', bgColor: 0xffd740 },
  { word: 'たのしい', color: 0x69f0ae, colorName: 'たのしい', bgColor: 0x69f0ae },
  { word: 'つかれた', color: 0x448aff, colorName: 'つかれた', bgColor: 0x448aff },
  { word: 'いやだ', color: 0xff5252, colorName: 'いやだ', bgColor: 0xff5252 },
]

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTraced, setIsTraced] = useState(false)
  const [traceProgress, setTraceProgress] = useState(0)

  // Pixi.js の状態を保持する ref
  const wordLayerRef = useRef<Container | null>(null)
  const traceLayerRef = useRef<Container | null>(null)
  const effectLayerRef = useRef<Container | null>(null)
  const currentWordRef = useRef<WordColor>(WORDS[0])
  const tracePointsRef = useRef<{ x: number; y: number }[]>([])
  const tracedCountRef = useRef(0)
  const isTracingRef = useRef(false)
  const lastTracePosRef = useRef<{ x: number; y: number } | null>(null)
  const completedRef = useRef(false)

  // 現在の文字を同期
  useEffect(() => {
    currentWordRef.current = WORDS[currentIndex]
    setIsTraced(false)
    setTraceProgress(0)
    tracedCountRef.current = 0
    completedRef.current = false
    // 文字を再描画
    if (appRef.current) {
      drawWord()
    }
  }, [currentIndex])

  // ===== Pixi.js 初期化 =====
  useEffect(() => {
    if (!containerRef.current) return

    const app = new Application()
    let destroyed = false

    const init = async () => {
      await app.init({
        resizeTo: containerRef.current!,
        background: 0xffffff,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio, 2),
      })

      if (destroyed) {
        app.destroy(true)
        return
      }

      containerRef.current!.appendChild(app.canvas)
      appRef.current = app

      // レイヤー作成
      const wordLayer = new Container()
      const traceLayer = new Container()
      const effectLayer = new Container()
      app.stage.addChild(wordLayer)
      app.stage.addChild(traceLayer)
      app.stage.addChild(effectLayer)
      wordLayerRef.current = wordLayer
      traceLayerRef.current = traceLayer
      effectLayerRef.current = effectLayer

      // タッチ/マウスイベント
      app.canvas.addEventListener('pointerdown', onPointerDown)
      app.canvas.addEventListener('pointermove', onPointerMove)
      app.canvas.addEventListener('pointerup', onPointerUp)
      app.canvas.addEventListener('pointercancel', onPointerUp)

      // 最初の文字を描画
      drawWord()
    }

    const onPointerDown = (e: PointerEvent) => {
      const pos = getCanvasPos(e)
      isTracingRef.current = true
      lastTracePosRef.current = pos
      // なぞり軌跡を描く
      drawTracePoint(pos.x, pos.y)
      checkTrace(pos.x, pos.y)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isTracingRef.current) return
      const pos = getCanvasPos(e)
      const last = lastTracePosRef.current
      if (last) {
        const dist = Math.hypot(pos.x - last.x, pos.y - last.y)
        if (dist > 5) {
          drawTracePoint(pos.x, pos.y)
          checkTrace(pos.x, pos.y)
          lastTracePosRef.current = pos
        }
      }
    }

    const onPointerUp = () => {
      isTracingRef.current = false
      lastTracePosRef.current = null
    }

    const getCanvasPos = (e: PointerEvent) => {
      const rect = app.canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    const drawTracePoint = (x: number, y: number) => {
      const layer = traceLayerRef.current
      if (!layer) return
      const dot = new Graphics()
      dot.circle(x, y, 8)
      dot.fill({ color: currentWordRef.current.color, alpha: 0.6 })
      layer.addChild(dot)
    }

    const checkTrace = (x: number, y: number) => {
      if (completedRef.current) return
      const points = tracePointsRef.current
      let found = false
      for (const p of points) {
        const dist = Math.hypot(p.x - x, p.y - y)
        if (dist < 25) {
          found = true
          break
        }
      }
      if (found) {
        tracedCountRef.current++
        // ゲージ表示用の進捗を更新（2/3で完了）
        const progress = Math.min(tracedCountRef.current / points.length, 1)
        setTraceProgress(progress)
        // なぞり完了判定（2/3 = 約67%で完了）
        if (tracedCountRef.current >= points.length * 0.67) {
          completedRef.current = true
          setTraceProgress(1) // ゲージを満タンにする
          onTraceComplete()
        }
      }
    }


    const onTraceComplete = () => {
      setIsTraced(true)
      playTone(523, 0.2, 'sine', 0.4)
      setTimeout(() => playTone(659, 0.2, 'sine', 0.4), 150)
      setTimeout(() => playTone(784, 0.3, 'sine', 0.4), 300)

      // 背景を色で包むエフェクト
      const word = currentWordRef.current
      const layer = effectLayerRef.current
      if (!layer) return

      // 波紋エフェクト
      for (let i = 0; i < 3; i++) {
        const ripple = new Graphics()
        ripple.circle(0, 0, 10)
        ripple.fill({ color: word.color, alpha: 0.3 })
        ripple.position.set(app.screen.width / 2, app.screen.height / 2)
        layer.addChild(ripple)
        gsap.to(ripple, {
          scale: 8,
          alpha: 0,
          duration: 1.2,
          delay: i * 0.2,
          ease: 'power2.out',
          onComplete: () => ripple.destroy(),
        })
      }

      // 背景色を徐々に変化
      const bgColor = word.bgColor
      const hex = `#${bgColor.toString(16).padStart(6, '0')}`
      gsap.to(app.renderer, {
        background: hex,
        duration: 1.5,
        ease: 'power2.inOut',
      })
    }

    init()

    return () => {
      destroyed = true
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
    }
  }, [])

  // ===== 文字を描画 =====
  const drawWord = () => {
    const app = appRef.current
    const wordLayer = wordLayerRef.current
    const traceLayer = traceLayerRef.current
    if (!app || !wordLayer || !traceLayer) return

    // 既存の文字をクリア
    wordLayer.removeChildren()
    for (const child of wordLayer.children) {
      child.destroy()
    }
    traceLayer.removeChildren()
    for (const child of traceLayer.children) {
      child.destroy()
    }

    const word = currentWordRef.current
    const width = app.screen.width
    const height = app.screen.height

    // 大きな文字を表示
    const style = new TextStyle({
      fontFamily: 'Hiragino Kaku Gothic ProN, Hiragino Sans, Meiryo, sans-serif',
      fontSize: Math.min(width, height) * 0.25,
      fontWeight: 'bold',
      fill: '#cccccc',
      stroke: { color: '#aaaaaa', width: 2 },
    })
    const text = new Text({ text: word.word, style })
    text.anchor.set(0.5)
    text.position.set(width / 2, height / 2)
    wordLayer.addChild(text)

    // 文字の輪郭に沿った点列を生成（なぞり判定用）
    // シンプルに文字の周囲に点を配置
    const points: { x: number; y: number }[] = []
    const textWidth = text.width
    const textHeight = text.height
    const cx = width / 2
    const cy = height / 2
    const halfW = textWidth / 2
    const halfH = textHeight / 2

    // 文字の周囲に点を配置（矩形の輪郭に沿って）
    const step = 20
    // 上辺
    for (let x = -halfW; x <= halfW; x += step) {
      points.push({ x: cx + x, y: cy - halfH })
    }
    // 右辺
    for (let y = -halfH; y <= halfH; y += step) {
      points.push({ x: cx + halfW, y: cy + y })
    }
    // 下辺
    for (let x = halfW; x >= -halfW; x -= step) {
      points.push({ x: cx + x, y: cy + halfH })
    }
    // 左辺
    for (let y = halfH; y >= -halfH; y -= step) {
      points.push({ x: cx - halfW, y: cy + y })
    }

    tracePointsRef.current = points
    tracedCountRef.current = 0
    setTraceProgress(0)
  }

  // ===== 次の文字へ =====
  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % WORDS.length)
  }

  // ===== 前の文字へ =====
  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + WORDS.length) % WORDS.length)
  }

  const currentWord = WORDS[currentIndex]

  return (
    <div className="app-container">
      <div ref={containerRef} className="canvas-container" />

      {/* 上部ナビゲーション */}
      <div className="nav-bar">
        <button className="nav-btn" onClick={handlePrev}>
          ◀
        </button>
        <div className="word-label">
          <span className="word-name">{currentWord.word}</span>
        </div>
        <button className="nav-btn" onClick={handleNext}>
          ▶
        </button>
      </div>

      {/* なぞり進捗（traceProgress は 0〜1 の比率） */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${Math.min(traceProgress * 100, 100)}%`,
          }}
        />
      </div>


      {/* なぞり完了メッセージ */}
      {isTraced && (
        <div className="complete-banner">
          <span className="complete-text">✨ {currentWord.colorName}！ ✨</span>
        </div>
      )}

      {/* 下部ヒント */}
      <div className="hint-bar">
        <span className="hint-text">👆 じを なぞってね！</span>
      </div>
    </div>
  )
}

export default App
