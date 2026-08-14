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

// ===== 文字データ =====
interface GardenChar {
  char: string
  color: number
  bgColor: number
}

const GARDEN_CHARS: GardenChar[] = [
  { char: 'あ', color: 0x66bb6a, bgColor: 0xe8f5e9 },
  { char: 'い', color: 0x42a5f5, bgColor: 0xe3f2fd },
  { char: 'う', color: 0xffa726, bgColor: 0xfff3e0 },
  { char: 'え', color: 0xec407a, bgColor: 0xfce4ec },
  { char: 'お', color: 0xab47bc, bgColor: 0xf3e5f5 },
]

// ===== 文字の形を点列で表現する（Text テクスチャから自動生成） =====
// Pixi.js の Text オブジェクトを描画し、そのテクスチャのピクセルデータから
// 文字の形に沿った点列を生成する
function generateCharPoints(
  app: Application,
  char: string,
  cx: number,
  cy: number,
  size: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []

  // Text オブジェクトを作成
  const style = new TextStyle({
    fontFamily: 'Hiragino Kaku Gothic ProN, Hiragino Sans, Meiryo, sans-serif',
    fontSize: size,
    fontWeight: 'bold',
    fill: '#ffffff',
  })
  const text = new Text({ text: char, style })
  text.anchor.set(0.5)

  // テクスチャを生成してピクセルデータを取得
  const texture = app.renderer.generateTexture(text)
  const source = texture.source
  const texWidth = source.width
  const texHeight = source.height

  // 文字の中心位置（テクスチャの中心）
  const offsetX = cx - texWidth / 2
  const offsetY = cy - texHeight / 2

  // ピクセルデータを取得（ImageBitmap を canvas に描画して読み取る）
  const resource = source.resource as ImageBitmap | HTMLCanvasElement | null
  if (resource) {
    const canvas = document.createElement('canvas')
    canvas.width = texWidth
    canvas.height = texHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(resource, 0, 0)
      const imageData = ctx.getImageData(0, 0, texWidth, texHeight)
      const pixels = imageData.data

      // ピクセルデータから不透明な部分を抽出
      const step = 6 // 点の間隔（ピクセル）
      for (let y = 0; y < texHeight; y += step) {
        for (let x = 0; x < texWidth; x += step) {
          const idx = (y * texWidth + x) * 4
          const alpha = pixels[idx + 3]
          if (alpha > 128) {
            points.push({ x: offsetX + x, y: offsetY + y })
          }
        }
      }
    }
  }

  // テクスチャを破棄
  texture.destroy(true)

  return points
}



function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [traceProgress, setTraceProgress] = useState(0)

  // Pixi.js の状態を保持する ref
  const wordLayerRef = useRef<Container | null>(null)
  const traceLayerRef = useRef<Container | null>(null)
  const plantLayerRef = useRef<Container | null>(null)
  const effectLayerRef = useRef<Container | null>(null)
  const currentCharRef = useRef<GardenChar>(GARDEN_CHARS[0])
  const charPointsRef = useRef<{ x: number; y: number }[]>([])
  const tracedPointsRef = useRef<Set<number>>(new Set())
  const isTracingRef = useRef(false)
  const lastTracePosRef = useRef<{ x: number; y: number } | null>(null)
  const completedRef = useRef(false)
  const plantsRef = useRef<{ x: number; y: number; graphics: Graphics; pulled: boolean }[]>([])

  // 現在の文字を同期
  useEffect(() => {
    currentCharRef.current = GARDEN_CHARS[currentIndex]
    setIsComplete(false)
    setTraceProgress(0)
    tracedPointsRef.current = new Set()
    completedRef.current = false
    plantsRef.current = []
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
        background: GARDEN_CHARS[0].bgColor,
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
      const plantLayer = new Container()
      const effectLayer = new Container()
      app.stage.addChild(wordLayer)
      app.stage.addChild(traceLayer)
      app.stage.addChild(plantLayer)
      app.stage.addChild(effectLayer)
      wordLayerRef.current = wordLayer
      traceLayerRef.current = traceLayer
      plantLayerRef.current = plantLayer
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
      // 生えた草をタップしたら抜く
      if (tryPullPlant(pos.x, pos.y)) {
        return
      }
      isTracingRef.current = true
      lastTracePosRef.current = pos
      checkTrace(pos.x, pos.y)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isTracingRef.current) return
      const pos = getCanvasPos(e)
      const last = lastTracePosRef.current
      if (last) {
        const dist = Math.hypot(pos.x - last.x, pos.y - last.y)
        if (dist > 5) {
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

    // 生えた草をタップで抜く
    const tryPullPlant = (x: number, y: number): boolean => {
      const plants = plantsRef.current
      for (const plant of plants) {
        if (plant.pulled) continue
        const dist = Math.hypot(plant.x - x, plant.y - y)
        if (dist < 30) {
          plant.pulled = true
          pullPlant(plant)
          return true
        }
      }
      return false
    }

    // 草を抜く演出
    const pullPlant = (plant: { x: number; y: number; graphics: Graphics; pulled: boolean }) => {
      const layer = effectLayerRef.current
      const app = appRef.current
      if (!layer || !app) return

      // スポン！と抜ける音
      playTone(300, 0.1, 'square', 0.3)
      setTimeout(() => playTone(500, 0.15, 'sine', 0.3), 80)

      // 草が抜けるアニメーション
      gsap.to(plant.graphics, {
        y: plant.y - 40,
        alpha: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          plant.graphics.destroy()
        },
      })

      // 抜けた場所から色が広がる
      const burst = new Graphics()
      burst.circle(plant.x, plant.y, 10)
      burst.fill({ color: currentCharRef.current.color, alpha: 0.5 })
      layer.addChild(burst)
      gsap.to(burst, {
        scale: 6,
        alpha: 0,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: () => burst.destroy(),
      })

      // 背景色を変える
      const bgColor = currentCharRef.current.bgColor
      const hex = `#${bgColor.toString(16).padStart(6, '0')}`
      gsap.to(app.renderer, {
        background: hex,
        duration: 0.8,
        ease: 'power2.inOut',
      })
    }

    const checkTrace = (x: number, y: number) => {
      if (completedRef.current) return
      const points = charPointsRef.current
      let found = false
      let foundIndex = -1
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        const dist = Math.hypot(p.x - x, p.y - y)
        if (dist < 30) {
          found = true
          foundIndex = i
          break
        }
      }
      if (found && foundIndex >= 0 && !tracedPointsRef.current.has(foundIndex)) {
        tracedPointsRef.current.add(foundIndex)
        // なぞった場所に芽を生やす
        const p = points[foundIndex]
        growPlant(p.x, p.y)
        // ゲージ表示用の進捗を更新
        const progress = Math.min(tracedPointsRef.current.size / points.length, 1)
        setTraceProgress(progress)
        // なぞり完了判定（80%以上なぞったら完了）
        if (tracedPointsRef.current.size >= points.length * 0.8) {
          completedRef.current = true
          setTraceProgress(1)
          onTraceComplete()
        }
      }
    }

    // 芽を生やす
    const growPlant = (x: number, y: number) => {
      const layer = plantLayerRef.current
      if (!layer) return
      const plant = new Graphics()
      // 茎
      plant.moveTo(x, y + 10)
      plant.lineTo(x, y - 8)
      plant.stroke({ color: 0x66bb6a, width: 3 })
      // 葉っぱ
      plant.circle(x - 5, y - 6, 4)
      plant.fill({ color: 0x81c784 })
      plant.circle(x + 5, y - 6, 4)
      plant.fill({ color: 0x81c784 })
      // 花
      plant.circle(x, y - 12, 5)
      plant.fill({ color: currentCharRef.current.color })
      plant.alpha = 0
      layer.addChild(plant)
      // ニョキニョキと生えるアニメーション
      gsap.to(plant, {
        alpha: 1,
        y: y - 5,
        duration: 0.4,
        ease: 'back.out(2)',
      })
      plantsRef.current.push({ x, y, graphics: plant, pulled: false })
    }

    const onTraceComplete = () => {
      setIsComplete(true)
      playTone(523, 0.2, 'sine', 0.4)
      setTimeout(() => playTone(659, 0.2, 'sine', 0.4), 150)
      setTimeout(() => playTone(784, 0.3, 'sine', 0.4), 300)

      // 文字全体を表示
      const word = currentCharRef.current
      const wordLayer = wordLayerRef.current
      if (wordLayer) {
        wordLayer.removeChildren()
        for (const child of wordLayer.children) {
          child.destroy()
        }
        const app = appRef.current
        if (app) {
          const style = new TextStyle({
            fontFamily: 'Hiragino Kaku Gothic ProN, Hiragino Sans, Meiryo, sans-serif',
            fontSize: Math.min(app.screen.width, app.screen.height) * 0.3,
            fontWeight: 'bold',
            fill: '#ffffff',
            stroke: { color: '#000000', width: 3 },
          })
          const text = new Text({ text: word.char, style })
          text.anchor.set(0.5)
          text.position.set(app.screen.width / 2, app.screen.height / 2)
          wordLayer.addChild(text)
        }
      }

      // 花火エフェクト
      const layer = effectLayerRef.current
      const app = appRef.current
      if (!layer || !app) return
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2
        const startX = app.screen.width / 2
        const startY = app.screen.height / 2
        const burst = new Graphics()
        burst.circle(0, 0, 8)
        burst.fill({ color: word.color, alpha: 0.8 })
        burst.position.set(startX, startY)
        layer.addChild(burst)
        gsap.to(burst, {
          x: startX + Math.cos(angle) * 150,
          y: startY + Math.sin(angle) * 150,
          alpha: 0,
          duration: 0.8,
          ease: 'power2.out',
          onComplete: () => burst.destroy(),
        })
      }
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
    const plantLayer = plantLayerRef.current
    const effectLayer = effectLayerRef.current
    if (!app || !wordLayer || !traceLayer || !plantLayer || !effectLayer) return

    // 既存の要素をクリア
    wordLayer.removeChildren()
    for (const child of wordLayer.children) {
      child.destroy()
    }
    traceLayer.removeChildren()
    for (const child of traceLayer.children) {
      child.destroy()
    }
    plantLayer.removeChildren()
    for (const child of plantLayer.children) {
      child.destroy()
    }
    effectLayer.removeChildren()
    for (const child of effectLayer.children) {
      child.destroy()
    }
    plantsRef.current = []

    const word = currentCharRef.current
    const width = app.screen.width
    const height = app.screen.height
    const cx = width / 2
    const cy = height / 2

    // 背景色を設定
    app.renderer.background.color = word.bgColor


    // 文字の大きさ
    const charSize = Math.min(width, height) * 0.35

    // 実際の文字を半透明で表示（なぞるガイド）
    const guideStyle = new TextStyle({
      fontFamily: 'Hiragino Kaku Gothic ProN, Hiragino Sans, Meiryo, sans-serif',
      fontSize: charSize,
      fontWeight: 'bold',
      fill: '#999999',
    })
    const guideText = new Text({ text: word.char, style: guideStyle })
    guideText.anchor.set(0.5)
    guideText.position.set(cx, cy)
    guideText.alpha = 0.4
    wordLayer.addChild(guideText)


    // 文字の形に沿った点列を生成（なぞり判定用）
    const points = generateCharPoints(app, word.char, cx, cy, charSize)
    charPointsRef.current = points

    // 土の表現（下部に土の帯）
    const soil = new Graphics()
    soil.rect(0, height * 0.75, width, height * 0.25)
    soil.fill({ color: 0x8d6e63, alpha: 0.3 })
    wordLayer.addChild(soil)
  }


  // ===== 次の文字へ =====
  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % GARDEN_CHARS.length)
  }

  // ===== 前の文字へ =====
  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + GARDEN_CHARS.length) % GARDEN_CHARS.length)
  }

  const currentChar = GARDEN_CHARS[currentIndex]

  return (
    <div className="app-container">
      <div ref={containerRef} className="canvas-container" />

      {/* 上部ナビゲーション */}
      <div className="nav-bar">
        <button className="nav-btn" onClick={handlePrev}>
          ◀
        </button>
        <div className="word-label">
          <span className="word-name">{currentChar.char}</span>
        </div>
        <button className="nav-btn" onClick={handleNext}>
          ▶
        </button>
      </div>

      {/* なぞり進捗 */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${Math.min(traceProgress * 100, 100)}%`,
          }}
        />
      </div>

      {/* なぞり完了メッセージ */}
      {isComplete && (
        <div className="complete-banner">
          <span className="complete-text">✨ {currentChar.char}！ ✨</span>
        </div>
      )}

      {/* 下部ヒント */}
      <div className="hint-bar">
        <span className="hint-text">👆 じを なぞってね！ はえた くさは タップで ぬけるよ！</span>
      </div>
    </div>
  )
}

export default App
