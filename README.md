# naoko-kids-app

失語症を持つ7歳の男の子のための、言葉に依存せず直感的に楽しめる子ども向けWebアプリ集です。

## 🎨 アプリ一覧

| アプリ | フォルダ | 説明 |
|--------|----------|------|
| 草抜き＆お絵かきモンスター | `app-kusanuki` | 描いた線が生き物になり、草を一緒に抜いてくれる |
| なぞって変身！色のふしぎ文字 | `app-nazori` | 文字をなぞると背景色と文字が連動して変化 |
| コミュニケーション補助 | `app-tsunagu` | 感情・意思を色とタップで伝える |
| 文字のめばえガーデン | `app-garden` | 文字を辿ると草花が生え、抜くと色が広がる |
| うごく！お絵かきダンススタジオ | `app-dance` | 描いた線が音楽に合わせて踊る |

## 🛠 技術スタック

- **言語**: TypeScript
- **UI**: React + Vite
- **描画**: Pixi.js
- **アニメーション**: GSAP
- **効果音**: Howler.js
- **PWA**: vite-plugin-pwa
- **デプロイ**: GitHub Pages + GitHub Actions

## 🚀 開発手順

### 前提条件
- Node.js 20以上
- npm

### ローカル開発

```bash
# アプリ1の開発サーバー起動
cd app-kusanuki
npm install
npm run dev
```

### デプロイ

`main` ブランチにプッシュすると、GitHub Actions が自動で全アプリをビルドし、GitHub Pages にデプロイします。

## 📁 フォルダ構成

```
naoko-kids-app/
├── .github/workflows/deploy.yml   # 自動デプロイ設定
├── index.html                     # 全アプリへのリンク集
├── app-kusanuki/                  # アプリ1
├── app-nazori/                    # アプリ2
├── app-tsunagu/                   # アプリ3
├── app-garden/                    # アプリ4
└── app-dance/                     # アプリ5
```
