# JO-SPLASH — CHROMA DUEL

Three.js 製、ブラウザで動作する 1 対 1 のインク陣取り TPS ゲームです。
床をインクで塗り合い、制限時間(90秒)終了時により広い面積を塗っていた側が勝利します。

## 起動方法

ビルドツールを使わない素の ES Modules 構成です。ブラウザの `fetch`/モジュール読み込みは
`file://` では動作しないため、任意の静的ファイルサーバーで配信してください。

```bash
# 例1: Python
python3 -m http.server 8080

# 例2: Node (npx)
npx serve .
```

起動後、ブラウザで `http://localhost:8080/index.html` を開いてください。

## 操作方法

| 操作 | 内容 |
| --- | --- |
| W / A / S / D | 移動 |
| マウス | カメラ操作・照準 |
| 左クリック | インク発射 |
| Space | ジャンプ |
| Shift | 自分色の床で高速移動（インクサーフ） |
| Esc | マウスロック解除 |
| R | ゲーム終了後のリスタート |
| `` ` `` (Backquote) | デバッグオーバーレイ表示切替 |

## ディレクトリ構成

```
index.html              エントリーポイント（importmap で three を解決）
src/
  main.js               起動処理
  config.js             全ての数値パラメータ（バランス調整はここだけ見ればよい）
  style.css             UI スタイル（オリジナルデザイン）
  core/
    Game.js             状態遷移・メインループ・各システムの配線
    InputManager.js      キーボード / マウス / ポインターロック
    CameraController.js  三人称カメラ（追従・衝突回避）
  entities/
    Character.js         Player / EnemyAI 共通の HP・インク・衝突・復活ロジック
    Player.js             プレイヤー入力処理
    EnemyAI.js            CPU の状態機械・操舵・射撃
  systems/
    Arena.js              ステージ形状・衝突コリジョン
    PaintSystem.js        塗装グリッド + CanvasTexture 描画
    Weapon.js             発射制御（クールダウン・インク消費）
    ProjectileManager.js  インク弾のオブジェクトプール・衝突判定
    ParticleManager.js    エフェクトのオブジェクトプール
  ui/
    UIManager.js          HUD・タイトル・結果画面等の DOM 操作
  audio/
    AudioManager.js       Web Audio API による効果音合成
  vendor/three/           ベンダリングした Three.js（npm registry から取得、CDN 不使用）
```

## 現在の制限事項

- ステージは 1 種類のみ（小型アリーナ）
- 塗装可能なのは床のみ（壁・障害物・高台は不可）
- CPU 難易度は「標準」1 段階のみ（`config.js` の `AI` セクションで調整可能な構造は用意済み）
- モバイル操作（タッチ）は未対応
- セーブ／永続化機能はなし（1 セッション完結）
