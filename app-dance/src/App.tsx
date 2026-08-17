import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import gsap from 'gsap'
import './App.css'

// ===== シンプルな効果音を Web Audio API で生成するヘルパー =====
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

// ===== ダンスパターン定義 =====
interface DancePattern {
  name: string
  label: string
  bgColor: number
  bgColorHex: string
}

const DANCE_PATTERNS: DancePattern[] = [
  { name: 'jump', label: 'ジャンプ', bgColor: 0x1a1a2e, bgColorHex: '#1a1a2e' },
  { name: 'curl', label: 'クルクル', bgColor: 0x2d1b69, bgColorHex: '#2d1b69' },
  { name: 'wave', label: 'ウネウネ', bgColor: 0x0f3460, bgColorHex: '#0f3460' },
  { name: 'spin', label: 'グルグル', bgColor: 0x16213e, bgColorHex: '#16213e' },
  { name: 'bounce', label: 'ポヨンポヨン', bgColor: 0x533483, bgColorHex: '#533483' },
]

// 描画色のパレット
const DRAW_COLORS = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xff80ab, 0xb388ff, 0xffffff]

// ===== 描いた線（ストローク）のデータ =====
interface Stroke {
  points: { x: number; y: number }[]
  color: number
  width: number
  graphics: Graphics
  // アニメーション用の基準位置
  baseX: number
  baseY: number
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const drawLayerRef = useRef<Container | null>(null)
  const effectLayerRef = useRef<Container | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const currentStrokeRef = useRef<Stroke | null>(null)
  const isDrawingRef = useRef(false)
  const patternIndexRef = useRef(0)
  const [patternIndex, setPatternIndex] = useState(0)
  const [showHint, setShowHint] = useState(true)

  const animFrameRef = useRef<number | null>(null)
  const timeRef = useRef(0)

  // 現在のパターンを同期
  useEffect(() => {
    patternIndexRef.current = patternIndex
  }, [patternIndex])

  // ===== Pixi.js 初期化 =====
  useEffect(() => {
    if (!containerRef.current) return

    const app = new Application()
    let destroyed = false

    const init = async () => {
      await app.init({
        resizeTo: containerRef.current!,
        background: DANCE_PATTERNS[0].bgColor,
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
      const drawLayer = new Container()
      const effectLayer = new Container()
      app.stage.addChild(drawLayer)
      app.stage.addChild(effectLayer)
      drawLayerRef.current = drawLayer
      effectLayerRef.current = effectLayer

      // タッチ/マウスイベント
      app.canvas.addEventListener('pointerdown', onPointerDown)
      app.canvas.addEventListener('pointermove', onPointerMove)
      app.canvas.addEventListener('pointerup', onPointerUp)
      app.canvas.addEventListener('pointercancel', onPointerUp)

      // アニメーションループ開始
      startAnimationLoop()
    }

    const getCanvasPos = (e: PointerEvent) => {
      const rect = app.canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      const pos = getCanvasPos(e)
      // 描画開始
      isDrawingRef.current = true
      const color = DRAW_COLORS[Math.floor(Math.random() * DRAW_COLORS.length)]
      const width = 8 + Math.random() * 10
      const graphics = new Graphics()
      graphics.moveTo(pos.x, pos.y)
      graphics.lineTo(pos.x + 0.1, pos.y + 0.1)
      graphics.stroke({ color, width, cap: 'round', join: 'round' })
      drawLayerRef.current?.addChild(graphics)

      const stroke: Stroke = {
        points: [pos],
        color,
        width,
        graphics,
        baseX: pos.x,
        baseY: pos.y,
      }
      currentStrokeRef.current = stroke
      strokesRef.current.push(stroke)
      // 描画音
      playTone(400 + Math.random() * 200, 0.05, 'triangle', 0.15)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current) return
      const pos = getCanvasPos(e)
      const stroke = currentStrokeRef.current
      if (!stroke) return
      const last = stroke.points[stroke.points.length - 1]
      const dist = Math.hypot(pos.x - last.x, pos.y - last.y)
      if (dist < 3) return
      stroke.points.push(pos)
      stroke.graphics.lineTo(pos.x, pos.y)
      stroke.graphics.stroke({ color: stroke.color, width: stroke.width, cap: 'round', join: 'round' })
    }

    const onPointerUp = () => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false
        currentStrokeRef.current = null
        // 描き終わったらダンス開始
        if (strokesRef.current.length > 0) {
          setShowHint(false)
        }

      }
    }

    // ===== アニメーションループ（線を踊らせる） =====
    const startAnimationLoop = () => {
      const tick = () => {
        timeRef.current += 0.016
        const t = timeRef.current
        const pattern = DANCE_PATTERNS[patternIndexRef.current]
        const strokes = strokesRef.current

        for (const stroke of strokes) {
          const pts = stroke.points
          if (pts.length < 2) continue

          // 各点をパターンに応じて動かす
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i]
            const offset = i * 0.15
            let dx = 0
            let dy = 0

            switch (pattern.name) {
              case 'jump':
                // 上下に跳ねる
                dy = Math.sin(t * 4 + offset) * 20
                break
              case 'curl':
                // クルクル回る
                dx = Math.cos(t * 3 + offset) * 15
                dy = Math.sin(t * 3 + offset) * 15
                break
              case 'wave':
                // イモムシのようにウネウネ
                dx = Math.sin(t * 5 + offset) * 25
                dy = Math.cos(t * 2 + offset) * 8
                break
              case 'spin':
                // 全体が回転
                const angle = t * 2 + offset
                dx = Math.cos(angle) * 30
                dy = Math.sin(angle) * 30
                break
              case 'bounce':
                // ポヨンポヨン
                dy = Math.abs(Math.sin(t * 6 + offset)) * -30
                break
            }

            // 点の位置を更新（元の位置 + 動き）
            const origX = stroke.baseX + (p.x - stroke.baseX)
            const origY = stroke.baseY + (p.y - stroke.baseY)
            // 実際の描画位置を更新するため、Graphics を再描画
            // ここでは簡易的に、各点のオフセットを計算して再描画する
            stroke.points[i] = { x: origX + dx, y: origY + dy }
          }

          // Graphics を再描画
          stroke.graphics.clear()
          stroke.graphics.moveTo(stroke.points[0].x, stroke.points[0].y)
          for (let i = 1; i < stroke.points.length; i++) {
            stroke.graphics.lineTo(stroke.points[i].x, stroke.points[i].y)
          }
          stroke.graphics.stroke({ color: stroke.color, width: stroke.width, cap: 'round', join: 'round' })
        }

        animFrameRef.current = requestAnimationFrame(tick)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }

    init()

    return () => {
      destroyed = true
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
    }
  }, [])

  // ===== パターン切り替え（タップ） =====
  const handleTap = () => {
    const next = (patternIndex + 1) % DANCE_PATTERNS.length
    setPatternIndex(next)
    // 背景色を変える
    const app = appRef.current
    if (app) {
      const hex = DANCE_PATTERNS[next].bgColorHex
      gsap.to(app.renderer, {
        background: hex,
        duration: 0.6,
        ease: 'power2.inOut',
      })
    }
    // 効果音
    playTone(600, 0.15, 'sine', 0.3)
    setTimeout(() => playTone(800, 0.15, 'sine', 0.3), 100)

    // 文字をふわっと浮かび上がらせる
    showPatternLabel(DANCE_PATTERNS[next].label)
  }

  // ===== パターン名をふわっと表示 =====
  const showPatternLabel = (label: string) => {
    const app = appRef.current
    const layer = effectLayerRef.current
    if (!app || !layer) return
    const style = new TextStyle({
      fontFamily: 'Hiragino Kaku Gothic ProN, Hiragino Sans, Meiryo, sans-serif',
      fontSize: Math.min(app.screen.width, app.screen.height) * 0.12,
      fontWeight: 'bold',
      fill: '#ffffff',
      stroke: { color: '#000000', width: 4 },
    })
    const text = new Text({ text: label, style })
    text.anchor.set(0.5)
    text.position.set(app.screen.width / 2, app.screen.height / 2)
    text.alpha = 0
    layer.addChild(text)
    gsap.to(text, {
      alpha: 1,
      y: text.y - 20,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(text, {
          alpha: 0,
          y: text.y - 40,
          duration: 0.6,
          delay: 0.8,
          ease: 'power2.in',
          onComplete: () => text.destroy(),
        })
      },
    })
  }

  // ===== クリア（全部消す） =====
  const handleClear = () => {
    const drawLayer = drawLayerRef.current
    if (drawLayer) {
      drawLayer.removeChildren()
      for (const child of drawLayer.children) {
        child.destroy()
      }
    }
    strokesRef.current = []
    setShowHint(true)
    playTone(300, 0.1, 'square', 0.2)

  }

  const currentPattern = DANCE_PATTERNS[patternIndex]

  return (
    <div className="app-container">
      <div ref={containerRef} className="canvas-container" />

      {/* 上部バー */}
      <div className="top-bar">
        <button className="clear-btn" onClick={handleClear}>
          🧹 けす
        </button>
        <div className="pattern-label">
          <span className="pattern-name">{currentPattern.label}</span>
        </div>
        <button className="tap-btn" onClick={handleTap}>
          ✨ チェンジ
        </button>
      </div>

      {/* ヒント */}
      {showHint && (
        <div className="hint-overlay">
          <div className="hint-box">
            <div className="hint-icon">✏️</div>
            <div className="hint-text">ゆびで せんを かいてね！</div>
            <div className="hint-sub">かいた せんが おどりだすよ！</div>
          </div>
        </div>
      )}

      {/* 下部ヒント */}
      <div className="bottom-bar">
        <span className="bottom-text">👆 タップで おどりが かわるよ！</span>
      </div>
    </div>
  )
}

export default App
