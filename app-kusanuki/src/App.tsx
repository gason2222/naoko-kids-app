import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics } from 'pixi.js'
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

// ===== 型定義 =====
interface Grass {
  graphics: Graphics
  x: number
  y: number
  pulled: boolean
  swayPhase: number
}

interface DrawingStroke {
  points: { x: number; y: number }[]
  color: number
  width: number
}

type GameMode = 'draw' | 'dance' | 'grass'

// ===== 色パレット =====
const COLORS = [
  { name: 'あか', value: 0xff5252 },
  { name: 'あお', value: 0x448aff },
  { name: 'きいろ', value: 0xffd740 },
  { name: 'みどり', value: 0x69f0ae },
  { name: 'むらさき', value: 0xea80fc },
  { name: 'オレンジ', value: 0xffab40 },
]

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const [mode, setMode] = useState<GameMode>('draw')
  const [currentColor, setCurrentColor] = useState<number>(COLORS[0].value)
  const [grassCount, setGrassCount] = useState(0)
  const [totalGrass, setTotalGrass] = useState(0)
  const [isCleared, setIsCleared] = useState(false)

  // Pixi.js の状態を保持する ref
  const drawingLayerRef = useRef<Container | null>(null)
  const grassLayerRef = useRef<Container | null>(null)
  const effectLayerRef = useRef<Container | null>(null)
  const strokesRef = useRef<DrawingStroke[]>([])
  const currentStrokeRef = useRef<DrawingStroke | null>(null)
  const grassListRef = useRef<Grass[]>([])
  const isDrawingRef = useRef(false)
  const modeRef = useRef<GameMode>('draw')
  const colorRef = useRef<number>(COLORS[0].value)
  const clearedRef = useRef(false)
  const danceContainerRef = useRef<Container | null>(null)
  const grassPullingRef = useRef(false)
  const pullGrassAtRef = useRef<(x: number, y: number) => void>(() => {})



  // ref を同期
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    colorRef.current = currentColor
  }, [currentColor])

  // ===== Pixi.js 初期化 =====
  useEffect(() => {
    if (!containerRef.current) return

    const app = new Application()
    let destroyed = false

    const init = async () => {
      await app.init({
        resizeTo: containerRef.current!,
        background: 0x87ceeb,
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
      const drawingLayer = new Container()
      const grassLayer = new Container()
      const effectLayer = new Container()
      app.stage.addChild(drawingLayer)
      app.stage.addChild(grassLayer)
      app.stage.addChild(effectLayer)
      drawingLayerRef.current = drawingLayer
      grassLayerRef.current = grassLayer
      effectLayerRef.current = effectLayer

      // タッチ/マウスイベント
      app.canvas.addEventListener('pointerdown', onPointerDown)
      app.canvas.addEventListener('pointermove', onPointerMove)
      app.canvas.addEventListener('pointerup', onPointerUp)
      app.canvas.addEventListener('pointercancel', onPointerUp)

      // アニメーションループ
      app.ticker.add(animate)
    }

    const onPointerDown = (e: PointerEvent) => {
      const pos = getCanvasPos(e)
      if (modeRef.current === 'draw') {
        isDrawingRef.current = true
        const stroke: DrawingStroke = {
          points: [pos],
          color: colorRef.current,
          width: 14,
        }
        currentStrokeRef.current = stroke
        strokesRef.current.push(stroke)
        drawStroke(stroke)
      } else if (modeRef.current === 'grass') {
        pullGrassAtRef.current(pos.x, pos.y)
      }

    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current || modeRef.current !== 'draw') return
      const pos = getCanvasPos(e)
      const stroke = currentStrokeRef.current
      if (!stroke) return
      const last = stroke.points[stroke.points.length - 1]
      const dist = Math.hypot(pos.x - last.x, pos.y - last.y)
      if (dist > 3) {
        stroke.points.push(pos)
        drawStroke(stroke)
      }
    }

    const onPointerUp = () => {
      isDrawingRef.current = false
      currentStrokeRef.current = null
    }

    const getCanvasPos = (e: PointerEvent) => {
      const rect = app.canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    const drawStroke = (stroke: DrawingStroke) => {
      const layer = drawingLayerRef.current
      if (!layer) return
      // 各ストロークを個別の Graphics として管理
      // 線の形を保ったまま踊らせるため、ストロークごとに Graphics を作成
      const g = new Graphics()
      g.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        g.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      g.stroke({ width: stroke.width, color: stroke.color, cap: 'round', join: 'round' })
      layer.addChild(g)
    }


    const animate = () => {
      // 草の揺れアニメーション
      const time = app.ticker.lastTime / 1000
      for (const grass of grassListRef.current) {
        if (grass.pulled) continue
        grass.graphics.rotation = Math.sin(time * 2 + grass.swayPhase) * 0.08
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

  // ===== 草を抜く =====
  const pullGrassAt = (x: number, y: number) => {
    const grassList = grassListRef.current
    for (const grass of grassList) {
      if (grass.pulled) continue
      const dist = Math.hypot(grass.x - x, grass.y - y)
      if (dist < 40) {
        grass.pulled = true
        playTone(600 + Math.random() * 200, 0.1, 'triangle', 0.4)
        // 草を抜くアニメーション
        gsap.to(grass.graphics, {
          y: grass.graphics.y - 30,
          alpha: 0,
          rotation: (Math.random() - 0.5) * 0.5,
          duration: 0.3,
          ease: 'power2.out',
          onComplete: () => {
            grass.graphics.destroy()
          },
        })
        // パーティクル（葉っぱが飛び散る）
        spawnLeafParticles(x, y)
        setGrassCount((c) => c + 1)
        break
      }
    }
  }
  pullGrassAtRef.current = pullGrassAt


  const spawnLeafParticles = (x: number, y: number) => {
    const layer = effectLayerRef.current
    if (!layer) return
    for (let i = 0; i < 6; i++) {
      const leaf = new Graphics()
      leaf.rect(0, 0, 6, 12)
      leaf.fill({ color: 0x4caf50 })
      leaf.pivot.set(3, 6)
      leaf.position.set(x, y)
      leaf.rotation = Math.random() * Math.PI * 2
      layer.addChild(leaf)
      const angle = Math.random() * Math.PI * 2
      const dist = 30 + Math.random() * 40
      gsap.to(leaf, {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 20,
        rotation: leaf.rotation + (Math.random() - 0.5) * 2,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.3,
        ease: 'power2.out',
        onComplete: () => leaf.destroy(),
      })
    }
  }

  // ===== 草を生成 =====
  const generateGrass = () => {

    const app = appRef.current
    const layer = grassLayerRef.current
    if (!app || !layer) return

    // 既存の草をクリア
    for (const grass of grassListRef.current) {
      grass.graphics.destroy()
    }
    grassListRef.current = []
    layer.removeChildren()

    const width = app.screen.width
    const height = app.screen.height
    const count = 10 // 草の数は固定10個
    const list: Grass[] = []


    for (let i = 0; i < count; i++) {
      const x = 20 + Math.random() * (width - 40)
      const y = 20 + Math.random() * (height - 40)
      const g = new Graphics()
      drawGrassShape(g, x, y)
      layer.addChild(g)
      list.push({
        graphics: g,
        x,
        y,
        pulled: false,
        swayPhase: Math.random() * Math.PI * 2,
      })
    }

    grassListRef.current = list
    setTotalGrass(count)
    setGrassCount(0)
    setIsCleared(false)
    clearedRef.current = false
  }

  const drawGrassShape = (g: Graphics, x: number, y: number) => {
    // 草を大きく・太く表示（見やすくする）
    const height = 45 + Math.random() * 20 // 45〜65px
    const width = 12 + Math.random() * 6 // 12〜18px
    const color = Math.random() > 0.3 ? 0x2e7d32 : 0x388e3c // 濃い緑で視認性向上
    g.moveTo(x - width / 2, y)
    g.quadraticCurveTo(x - width / 2, y - height * 0.6, x, y - height)
    g.quadraticCurveTo(x + width / 2, y - height * 0.6, x + width / 2, y)
    g.closePath()
    g.fill({ color })
    // 草の茎の線を追加
    g.moveTo(x, y)
    g.lineTo(x, y - height)
    g.stroke({ width: 3, color: 0x1b5e20 })
    g.position.set(x, y)
    g.pivot.set(x, y)
  }


  // ===== 完成ボタン（線を踊らせる） =====
  const handleComplete = () => {
    if (strokesRef.current.length === 0) return
    setMode('dance')
    playTone(523, 0.2, 'sine', 0.3)
    playTone(659, 0.2, 'sine', 0.3)
    playTone(784, 0.3, 'sine', 0.3)

    // 描いた線を生き物のように踊らせる
    const layer = drawingLayerRef.current
    if (!layer) return

    // 線全体を1つの Container にまとめて、一体となって動かす
    const danceContainer = new Container()
    const children = [...layer.children]
    for (const child of children) {
      if (child instanceof Graphics) {
        layer.removeChild(child)
        danceContainer.addChild(child)
      }
    }
    layer.addChild(danceContainer)
    danceContainerRef.current = danceContainer

    // 線全体が一体となって「ウネウネ」と踊る
    // 移動量を小さくして、塗りつぶしに見えないようにする
    gsap.to(danceContainer, {
      y: danceContainer.y - 10,
      duration: 0.6,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })
    gsap.to(danceContainer, {
      rotation: 0.06,
      duration: 0.8,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })
    gsap.to(danceContainer, {
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 0.5,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })

    // 3秒後に草抜きモードへ
    setTimeout(() => {
      setMode('grass')
      generateGrass()
      // 線が草を抜いていく処理を開始
      setTimeout(() => {
        startGrassPulling()
      }, 500)
    }, 3000)
  }

  // ===== 線が草を抜いていく処理 =====
  const startGrassPulling = () => {
    if (grassPullingRef.current) return
    grassPullingRef.current = true

    const danceContainer = danceContainerRef.current
    const grassList = grassListRef.current
    if (!danceContainer || grassList.length === 0) return

    // 線の中心位置を計算
    const bounds = danceContainer.getBounds()
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2

    // 未抜きの草を取得
    const remaining = grassList.filter((g) => !g.pulled)
    if (remaining.length === 0) {
      grassPullingRef.current = false
      return
    }

    // 線に最も近い草を選ぶ
    let nearest = remaining[0]
    let nearestDist = Infinity
    for (const grass of remaining) {
      const dist = Math.hypot(grass.x - centerX, grass.y - centerY)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = grass
      }
    }

    // 線が草の位置へ移動して草を抜く
    const targetX = nearest.x
    const targetY = nearest.y

    // 移動中は踊りを止めて、草に向かって移動する
    gsap.killTweensOf(danceContainer)
    gsap.to(danceContainer, {
      x: targetX - centerX + danceContainer.x,
      y: targetY - centerY + danceContainer.y,
      duration: 0.8,
      ease: 'power2.inOut',
      onComplete: () => {
        // 草を抜く
        pullGrassAt(targetX, targetY)
        // 少し跳ねる
        gsap.to(danceContainer, {
          y: danceContainer.y - 15,
          duration: 0.2,
          yoyo: true,
          repeat: 1,
          ease: 'power2.out',
          onComplete: () => {
            // 次の草へ
            grassPullingRef.current = false
            setTimeout(() => {
              startGrassPulling()
            }, 300)
          },
        })
      },
    })
  }



  // ===== クリア演出（花火） =====
  useEffect(() => {
    if (isCleared && !clearedRef.current) {
      clearedRef.current = true
      playTone(784, 0.2, 'sine', 0.4)
      setTimeout(() => playTone(1046, 0.3, 'sine', 0.4), 200)
      setTimeout(() => playTone(1318, 0.4, 'sine', 0.4), 400)
      spawnFireworks()
    }
  }, [isCleared])

  const spawnFireworks = () => {
    const app = appRef.current
    const layer = effectLayerRef.current
    if (!app || !layer) return
    const width = app.screen.width
    const height = app.screen.height

    for (let i = 0; i < 5; i++) {
      const x = width * (0.2 + Math.random() * 0.6)
      const y = height * (0.2 + Math.random() * 0.4)
      const colors = [0xff5252, 0xffd740, 0x448aff, 0x69f0ae, 0xea80fc]
      const color = colors[Math.floor(Math.random() * colors.length)]

      setTimeout(() => {
        // 花火の粒子
        for (let j = 0; j < 20; j++) {
          const particle = new Graphics()
          particle.circle(0, 0, 3)
          particle.fill({ color })
          particle.position.set(x, y)
          layer.addChild(particle)
          const angle = (Math.PI * 2 * j) / 20
          const dist = 40 + Math.random() * 60
          gsap.to(particle, {
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            alpha: 0,
            duration: 0.8 + Math.random() * 0.4,
            ease: 'power2.out',
            onComplete: () => particle.destroy(),
          })
        }
        playTone(500 + Math.random() * 300, 0.3, 'triangle', 0.3)
      }, i * 300)
    }
  }

  // ===== リセット =====
  const handleReset = () => {
    const app = appRef.current
    const drawingLayer = drawingLayerRef.current
    const grassLayer = grassLayerRef.current
    const effectLayer = effectLayerRef.current
    if (!app) return

    // 全レイヤーをクリア
    if (drawingLayer) {
      drawingLayer.removeChildren()
      for (const child of drawingLayer.children) {
        child.destroy()
      }
    }
    if (grassLayer) {
      grassLayer.removeChildren()
      for (const child of grassLayer.children) {
        child.destroy()
      }
    }
    if (effectLayer) {
      effectLayer.removeChildren()
      for (const child of effectLayer.children) {
        child.destroy()
      }
    }
    strokesRef.current = []
    grassListRef.current = []
    setGrassCount(0)
    setTotalGrass(0)
    setIsCleared(false)
    clearedRef.current = false
    setMode('draw')
  }

  // ===== 草抜き完了チェック =====
  useEffect(() => {
    if (totalGrass > 0 && grassCount >= totalGrass) {
      setIsCleared(true)
    }
  }, [grassCount, totalGrass])

  return (
    <div className="app-container">
      <div ref={containerRef} className="canvas-container" />

      {/* 上部ツールバー */}
      <div className="toolbar">
        <div className="color-palette">
          {COLORS.map((c) => (
            <button
              key={c.name}
              className={`color-btn ${currentColor === c.value ? 'active' : ''}`}
              style={{ background: `#${c.value.toString(16).padStart(6, '0')}` }}
              onClick={() => setCurrentColor(c.value)}
              aria-label={c.name}
            />
          ))}
        </div>
        <button className="tool-btn reset-btn" onClick={handleReset}>
          🔄
        </button>
      </div>

      {/* モード表示 */}
      <div className="mode-banner">
        {mode === 'draw' && <span className="mode-text">✏️ えをかこう！</span>}
        {mode === 'dance' && <span className="mode-text">💃 おどってるよ！</span>}
        {mode === 'grass' && (
          <span className="mode-text">
            🌿 くさをぬこう！ ({grassCount}/{totalGrass})
          </span>
        )}
      </div>

      {/* 完成ボタン */}
      {mode === 'draw' && (
        <button className="complete-btn" onClick={handleComplete}>
          ✨ かんせい！
        </button>
      )}

      {/* クリア演出 */}
      {isCleared && (
        <div className="clear-overlay">
          <div className="clear-text">🎉 ぜんぶぬけた！ 🎉</div>
          <button className="again-btn" onClick={handleReset}>
            🔄 もういちど！
          </button>
        </div>
      )}
    </div>
  )
}

export default App
