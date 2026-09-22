# 物語制作向けマルチキャンバス・フローエディタ Shepherd
## 仕様書 v0.3

# 1. 概要

本アプリケーション『Shepherd』は、小説・ゲーム・シナリオなどの制作を目的とした、ローカル動作型のマルチキャンバス・フローエディタである。

カードを自由な位置に配置し、線で接続して物語構造を視覚化できる。

各カードにはタイトル・本文・タグを保持でき、ひとつのプロジェクト内で複数のキャンバスを作成できる。

同じ情報カードを複数キャンバスに配置できるため、

- メインプロット
- 時系列
- 人物相関図
- 勢力図
- 伏線整理
- 世界設定

などを同一プロジェクト内で相互参照しながら管理できる。

本アプリの中心思想は、

「物語情報そのもの」と「その情報をどこにどう配置して見るか」を分離する

ことである。

---

# 2. 基本構造

アプリケーションは以下の構造を持つ。

```text
Project
├─ Cards
├─ Tags
│
└─ Canvases
   ├─ Placements
   ├─ Areas
   └─ Edges
```

主要なドメイン概念は以下の6種類とする。

1. Project
2. Canvas
3. Card
4. Placement
5. Area
6. Edge

TagはCardやAreaへ付与する横断メタデータとして扱い、主要ドメイン概念には数えない。

ユーザーUI上では、Placementという内部用語を可能な限り意識させない。

ユーザーから見た基本操作は、

- カードを作る
- カードを配置する
- カードを移動する
- カードをつなぐ
- カードをAreaにまとめる

という形に統一する。

CardとPlacementの分離は実装初期から維持する。Cardは情報本体、Placementは特定Canvas上での位置・大きさ・Area所属を表す。

---

# 3. Project

## 3.1 概要

Projectは一つの作品または制作単位全体を表す。

例：

```text
小説「○○」
ゲーム「○○」
シナリオ企画「○○」
```

Projectは複数のCanvasと、プロジェクト共通のCardを保持する。

新規Project作成時には最低1つのCanvasを自動生成する。Core段階では初期名を `Canvas 1` とし、Project名が未指定の場合は `Untitled` とする。

## 3.2 Projectが保持する情報

Projectの永続データとして以下を扱う。

- ID
- プロジェクト名
- 作成日時
- 更新日時
- Card一覧
- Canvas一覧
- Tag一覧（Usable MVP以降）
- Project START / Bookmark情報（Usable MVP以降）
- 保存フォーマットバージョン

また、以下のWorkspace状態をProjectファイル内に保存してよい。

- 最後に開いていたCanvas
- CanvasごとのViewport

Workspace状態は作品内容そのものとは区別する。Viewport移動や最後に開いていたCanvasの変更だけで、ユーザーへ「作品内容に未保存変更がある」と警告しない。

---

# 4. Canvas

## 4.1 概要

Canvasは、Project内の情報を特定の観点から配置して見るための空間である。

一つのProject内に複数作成できる。

例：

```text
メインプロット
人物相関図
時系列
勢力図
伏線管理
設定整理
没案
```

Canvasは独立したProjectではない。

複数のCanvasは、同一のProject Dataを異なる観点から見るためのビューとして扱う。

## 4.2 キャンバス基本機能

Canvasは上下左右360度に拡張可能なインフィニットキャンバスとする。

完成時の基本操作は以下とする。

- パン
- ズームイン
- ズームアウト
- カード移動
- 単一選択
- 複数選択
- 範囲選択
- コピー
- ペースト
- Canvas上からの削除
- Undo
- Redo
- キーボードショートカット
- Canvas全体表示
- 選択項目へフォーカス
- ミニマップ

各機能の導入時期は「25. 実装フェーズ」に従う。

Canvas上のカードを移動した場合、接続されているEdgeは自動的に追従する。

CanvasごとにViewportを保持する。Viewport変更はUndo対象にせず、作品内容の未保存状態にも含めない。

---

# 5. 複数Canvas

## 5.1 Canvas一覧

画面左側にCanvas一覧を表示する。

例：

```text
CANVASES

メインプロット
人物相関図
勢力図
時系列
伏線管理

＋ Canvas
```

完成時には以下の操作に対応する。

- 新規作成
- 名前変更
- 複製
- 並び替え
- 削除

CoreではCanvasの新規作成と切り替えを必須とする。追加Canvasは即座に生成し、仮名を与えたうえでインライン名前変更できる構成を優先する。

Projectには常に1つ以上のCanvasが存在するものとする。

## 5.2 タブ

現在開いているCanvasは画面上部へタブ表示できる。

```text
[ メインプロット ] [ 人物相関図 ] [ 時系列 ]
```

多数のCanvasを同時にタブ表示する必要はなく、現在使用中のCanvasのみタブとして保持する。

Canvas一覧を恒久的なナビゲーション、タブを一時的な作業履歴として扱う。

---

# 6. Card

## 6.1 概要

CardはProject共通の情報オブジェクトである。

CardそのものはCanvas上の位置を持たない。

同じCardを複数Canvasに配置できる。

## 6.2 Cardが保持する情報

完成時の基本Cardは以下を保持する。

```text
ID
タイトル
本文
タグ
作成日時
更新日時
```

Coreではタグをまだ実装せず、ID・タイトル・本文・作成日時・更新日時のみでもよい。TagはUsable MVPで追加する。

任意属性システムは当面実装しない。

## 6.3 タイトル

タイトルはCanvas上に常時表示する。

例：

```text
第12場　地下室へ
```

## 6.4 本文

Cardには長文テキストを保存可能とする。

用途：

- 小説本文
- シーン概要
- キャラクター設定
- 世界設定
- 会話案
- 制作メモ

Coreでは本文形式をプレーンテキストとする。

Canvas上では全文を常時表示しない。

基本表示では本文冒頭のみ表示し、Card選択時に右側編集パネルから全文を編集する。

## 6.5 タグ

TagはUsable MVPで導入する。

Cardには任意数のタグを設定できる。

例：

```text
#アリス
#王国
#戦闘
#伏線
```

タグはProject全体で共有する。

タグは検索・絞り込みに使用する。

---

# 7. Placement

## 7.1 概要

Placementは、Cardを特定Canvas上に配置した状態を表す内部データである。

ユーザーUI上では原則として「カード」として扱う。

CardとPlacementを内部的に分離することで、同じCardを複数Canvasに配置できる。

例：

```text
Card: Alice

Placement 1
→ 人物相関図

Placement 2
→ 勢力図

Placement 3
→ 時系列
```

## 7.2 Placementが保持する情報

```text
ID
Card ID
Canvas ID
X座標
Y座標
幅
高さ
Area ID（Usable MVP以降）
```

CoreではCardサイズを固定標準サイズから開始し、ユーザーによるリサイズは実装しない。将来の拡張に備えてPlacementには幅・高さを保持してよい。

## 7.3 同一Cardの複数配置

「同一Cardは、同一Canvas内には1回だけ配置できる」ものとする。

同じCardを複数Canvasへ配置することは可能。

同一Canvasへの複数Placementが本当に必要になった場合のみ、Alias Placement等の別仕様を検討する。

## 7.4 新規Cardと既存Card

ユーザー操作として以下を区別する。

```text
新しいカードを作成
既存カードを配置
```

既存Cardを配置した場合、Cardの複製は作らない。

新しいPlacementのみ作成する。

CoreのCard作成は内部的には「Card作成 + 現在CanvasへのPlacement作成」を1つの操作として扱う。既存Card配置UIはMulti-viewフェーズで完成させる。

---

# 8. Card削除

Card本体の削除と、Canvas上からの除去を明確に分ける。

## 8.1 Canvas上から削除

Canvas上のCardを選択してDeleteした場合、

「現在のCanvasからPlacementを削除」

する。

Card本体は削除しない。

CoreからDeleteを実装する。Placement削除に伴って接続不能となるEdgeも同じ操作内で削除し、Undoでは一括して復元できるものとする。

## 8.2 Card本体の完全削除

Card本体の完全削除はProject Card一覧から行う。

他Canvasに配置されている場合は確認を表示する。

例：

```text
このカードは3つのキャンバスで使用されています。

プロジェクトから完全に削除しますか？
```

Card本体を削除した場合、そのCardに属する全Placementと、それらに接続されたEdgeも同一トランザクションで削除する。

Card完全削除UIはUsable MVP以降に実装する。

---

# 9. Card表示

基本表示：

```text
┌────────────────────┐
│ 第12場　地下室へ     │
│ #Alice #地下室      │
│                    │
│ 扉を開けると……     │
└────────────────────┘
```

Coreでは固定標準サイズのCardを使用し、タイトルと本文冒頭を表示する。Tag導入後はTagも表示できる。

将来的には以下の表示モードを用意できる。

```text
コンパクト
タイトルのみ

標準
タイトル
タグ
本文冒頭
```

表示モード切り替えはPolishフェーズで扱う。

---

# 10. Edge

## 10.1 概要

EdgeはCanvas上のPlacement同士を結ぶ線である。

Canvasに依存しないRelationという別概念は導入しない。

人物相関図・プロット・分岐なども、すべてEdgeとして扱う。

## 10.2 Edge情報

```text
ID
Canvas ID
接続元Placement ID
接続先Placement ID
ラベル
方向
表示スタイル（将来拡張）
```

## 10.3 Edgeラベル

Edgeには任意の文字列を設定できる。

例：

```text
成功
失敗
選択肢A
3日後
友人
敵対
好感度 >= 5
```

EdgeラベルはCoreから編集可能とする。

## 10.4 方向

Coreでは有向Edgeを標準とする。

将来的に人物関係などで必要な場合は無向Edgeも扱えるよう、データモデル上は `directed` / `undirected` を表現できる構成としてよい。

## 10.5 接続Handle

Canvasが360度に展開することを前提とし、Cardの上下左右からEdgeを接続できる。

```text
      ○
      │
○ ─ Card ─ ○
      │
      ○
```

Coreでは接続元・接続先の位置関係から適切なHandleを表示時に自動選択する。

Handle位置そのものはProjectファイルへ保存しない。手動ルーティングが必要になった場合に保存モデルの追加を検討する。

## 10.6 接続制約

CoreおよびUsable MVPでは以下とする。

- 同一Placementへの自己Edgeは禁止する。
- 同じ2つのPlacement間に複数Edgeを作ることは許可する。
- Edgeの両端Placementは必ず同一Canvasに属する。
- EdgeはCard IDではなくPlacement IDを参照する。

---

# 11. Area

## 11.1 概要

AreaはCanvas上の矩形オブジェクトではない。

Areaとは、

「複数のPlacementをひとまとまりとして扱うためのグループ属性」

である。

例：

```text
第一章
第二章
王国陣営
敵勢力
回想
主人公視点
エンディング群
```

Areaそのものが固定された四角形を持つわけではない。

## 11.2 Area情報

Areaは以下を保持する。

```text
ID
Canvas ID
名前
色
タグ
アンカー位置
折りたたみ状態
```

Area自体には、

```text
width
height
固定境界
```

を持たせない。

## 11.3 Area所属

Placementは0または1個のAreaに所属できる。

```text
Placement {
    areaId?: string
}
```

一つのPlacementを複数Areaへ同時所属させない。

複数の意味分類が必要な場合はTagを使う。

例：

```text
Area = 第一章
Tags = #王都 #Alice #伏線
```

## 11.4 Areaの表示領域

Areaの背景・枠は、所属Placementの位置から自動生成する。

所属Placementについて、

```text
最小X
最大X
最小Y
最大Y
```

を計算し、その外側へ一定の余白を加えてArea背景を描画する。

つまり、

```text
所属カードが動く
↓
Area表示範囲も自動で変化する
```

Areaの枠は所属関係の原因ではなく、所属関係を視覚化した結果である。

## 11.5 Areaへの追加

CardをArea表示範囲付近へドラッグすると、Areaをハイライトする。

その状態でドロップすると、

```text
placement.areaId = 対象Area
```

とする。

## 11.6 Areaからの除外

Area所属Cardを明確にAreaの外へドラッグしてドロップした場合、

```text
placement.areaId = null
```

とする。

数ピクセルのズレなどで自動的に所属解除しない。

## 11.7 Area移動

Areaタイトルまたは専用ハンドルをドラッグすると、所属する全Placementをまとめて移動する。

Area自身の固定矩形を移動するのではなく、所属Placement全体を移動する。

## 11.8 空Area

まだ所属Cardが存在しないAreaも作成可能とする。

空Areaは小さなラベルとして表示する。

例：

```text
[ 第二章 ]
```

空Areaには仮のアンカー位置を持たせる。

最初のCardが所属した時点で、そのCard群からArea表示範囲を計算する。

## 11.9 Areaタグ

Areaにもタグを設定できる。

例：

```text
第一章
#序盤
#王都
```

Area TagはArea自体の検索に使用する。

Area TagをCard Tagへ自動継承しない。

Cardの情報とCanvas上の文脈を分離する。

## 11.10 Area折りたたみ

Areaを折りたためる。

折りたたみ時は所属Placementを一時非表示にする。

代理表示：

```text
┌ 第一章 ───────── 14 cards ┐
└─────────────────────────┘
```

展開時は各Placementを元の座標へ戻す。

## 11.11 Area入れ子

当面は実装しない。

Areaは単一階層とする。

---

# 12. START

## 12.1 Project START

Projectには1つのSTART地点を設定できる。

STARTは、

```text
Canvas ID
Placement ID
Viewport
```

を保持する。

「STARTへ」を押すと対象Canvasへ移動し、対象Cardを画面中央へ表示する。

## 12.2 Bookmarkとの関係

内部的にはSTARTをBookmarkの特殊形として設計してもよい。

```text
Bookmark {
    canvasId
    targetId
    viewport
}
```

STARTはProjectで指定された特別なBookmarkとして扱う。

Usable MVPではSTARTのみを実装し、任意BookmarkはPolishフェーズで追加してよい。

将来的には、

```text
第一章冒頭
決戦
主人公陣営
エンディング分岐
```

など任意Bookmarkを追加できる。

---

# 13. ナビゲーション履歴

Canvas間の移動履歴を保持する。

基本操作：

```text
← Back
→ Forward
★ START
□ Fit Canvas
```

別Canvas上のCardへ移動した後、Backで元の場所へ戻れるようにする。

Canvas Homeという独立した概念は導入しない。

---

# 14. 複数Canvas間の参照

## 14.1 Card配置先一覧

Cardを選択した場合、そのCardが配置されているCanvas一覧を表示する。

例：

```text
USED IN

メインプロット
第一章

人物相関図
主人公陣営

勢力図
王国
```

項目をクリックすると、該当CanvasのPlacementへ移動する。

## 14.2 Canvas Link専用オブジェクト

当面は実装しない。

Canvas間移動は、

- Canvas一覧
- Card配置先一覧
- 検索
- ナビゲーション履歴

によって行う。

専用リンクカードは必要性が確認された場合のみ追加する。

## 14.3 Card本文内リンク

当面は実装しない。

将来的に必要になった場合、Card IDを参照する内部リンク機能を追加する。

---

# 15. 未配置Card

Cardは、どのCanvasにも配置されていない状態を許可する。

これをアイデア置き場として利用できる。

左サイドバー等に、

```text
UNPLACED

王女の過去
第三勢力？
地下研究所
```

のような一覧を表示する。

未配置CardはCanvasへドラッグして配置できる。

これにより、

「思いついた情報を先に作り、後で構造へ組み込む」

という制作方法に対応する。

---

# 16. 検索

## 16.1 Project横断検索

Project全体を検索対象とする。

検索対象：

- Cardタイトル
- Card本文
- Cardタグ
- Canvas名
- Area名
- Areaタグ

## 16.2 Command Palette

Project全体の検索・移動にはCommand Palette型UIを採用する。

例：

```text
Cmd/Ctrl + K
```

検索：

```text
Alice
```

結果：

```text
CARD
Alice

CANVAS
Alice Route

AREA
Alice Side

TAG
#Alice
```

Enterで該当対象へ移動する。

## 16.3 Canvas内検索

```text
Cmd/Ctrl + F
```

は現在Canvas内検索として使用する。

## 16.4 Tag検索

Tagによる絞り込みに対応する。

例：

```text
#Alice
```

Usable MVPでは複雑な検索構文を必須としない。

---

# 17. フィルター表示

検索またはTag指定時、Canvas上の表示を変更できる。

Usable MVPでは以下を基本とする。

```text
一致Card
→ 通常表示

非一致Card
→ 半透明
```

完全非表示は必要に応じて追加する。

---

# 18. 配置・スナップ

完全な固定グリッド方式にはしない。

自由配置を基本とする。

Usable MVPでは、

```text
自由移動
+
軽いグリッドスナップ
+
上下左右の整列ガイド
```

を実装する。

過度な自動配置は行わない。

Option / Altキー等を押している間はスナップを無効化できる仕様を検討する。

目標は、

「適当に置けるが、揃えたいときには揃えやすい」

操作感である。

Coreでは自由移動のみを必須とし、スナップと整列ガイドはUsable MVPへ回す。

---

# 19. Undo / Redo

Undo / Redoは操作単位で記録する。

ドラッグ中の各座標変更を個別履歴にしない。

以下はそれぞれ1操作として扱う。

```text
Card作成
Card移動
複数Card移動
Area全体移動
Placement削除
Card完全削除
Edge作成・削除
Paste
Area所属変更
タグ変更
```

Area移動で複数Placementが動いた場合も、一つのUndo操作とする。

Cardタイトル・本文の編集は1文字ごとにProject履歴へ追加せず、フォーカス移動、一定時間の入力停止、または明示的な編集確定を境界とする「編集セッション」単位で1件の履歴とする。

テキスト入力欄にフォーカスがある間は、可能な限りテキストエディタ自身の通常のUndoを優先し、編集確定後にアプリ全体の履歴へ反映する。テキスト内UndoとProject全体Undoを不必要に混同しない。

以下はUndo / Redo対象外とする。

- Zoom
- Pan
- Canvas切り替え
- 選択状態変更
- 保存・読み込み
- Workspace状態のみの変更

履歴上限はCoreでは約100操作を目安とする。

Undo / Redo履歴はProjectファイルへ永続化しない。

内部実装方式は仕様として固定しない。差分パッチ、immutable patch、コマンド方式など、操作単位の一貫性を保てる方式を採用する。

---

# 20. UI構成

基本レイアウト：

```text
┌──────────────────────────────────────────────┐
│ Project   +Card   START   ← →   Search       │
├──────────┬────────────────────────┬──────────┤
│          │                        │          │
│ CANVAS   │                        │ EDITOR   │
│ Plot     │    Infinite Canvas     │          │
│ People   │                        │ Title    │
│ Timeline │                        │ Tags     │
│          │                        │ Body     │
│ CARDS    │                        │          │
│          │                        │ Used In  │
│ TAGS     │                        │          │
│          │                        │          │
├──────────┴────────────────────────┴──────────┤
│ Zoom                         Minimap         │
└──────────────────────────────────────────────┘
```

## 20.1 左サイドバー

主に以下を表示する。

```text
Canvas一覧
Project Card一覧
Unplaced Card一覧
Tag一覧
```

## 20.2 中央

Infinite Canvas。

## 20.3 右サイドバー

選択中オブジェクトを編集する。

Card選択時：

```text
タイトル
タグ
本文
配置先一覧
```

Area選択時：

```text
名前
色
タグ
所属Card数
```

Edge選択時：

```text
ラベル
方向
表示設定
```

---

# 21. 基本ショートカット

```text
ドラッグ                 Card移動
Space + ドラッグ          Canvas移動
ホイール / Pinch          Zoom

Cmd/Ctrl + Z              Undo
Cmd/Ctrl + Shift + Z      Redo

Cmd/Ctrl + C              Copy
Cmd/Ctrl + V              Paste

Cmd/Ctrl + F              Canvas内検索
Cmd/Ctrl + K              Project検索

Delete                    Canvasから除去

Shift + Click             複数選択
```

macOSでは標準的なmacOS操作感を優先する。

---

# 22. 保存

## 22.1 基本方針

ローカル保存を基本とする。

当面は以下を実装しない。

- アカウント登録
- クラウドサーバー
- 共同編集
- オンライン同期

## 22.2 Projectファイル

独自拡張子を使用する。

暫定拡張子：

```text
.storyflow
```

`.storyflow` は開発中の仮称とし、正式リリース前であればアプリ名に合わせて変更してよい。

内部はJSONを基本とする。

保存フォーマットには必ず `formatVersion` を持たせ、後続フェーズのTag・Area・Bookmark等はバージョン移行で安全に追加する。Core段階から未使用機能の空配列を先行して持つ必要はない。

## 22.3 手動保存

Coreから以下を実装する。

- Open
- Save
- Save As

新規Project、別ProjectのOpen、アプリ終了などで未保存の作品内容がある場合は破棄確認を行う。

## 22.4 Atomic Save

手動保存を含め、Project本体への書き込みは可能な限りAtomic Saveとする。

```text
project.storyflow.tmp
↓
書き込み完了を確認
↓
project.storyflowへ置換
```

保存失敗時に既存Projectファイルを破損させないことを優先する。

## 22.5 Dirty状態

未保存状態を2種類に分ける。

### contentDirty

作品内容・構造に関する変更。

例：

- Card作成・編集・削除
- Canvas構造変更
- Placement追加・移動・削除
- Edge変更
- Tag / Area / START変更

`contentDirty = true` の場合、UIへ `Unsaved changes` を表示し、Projectを閉じる際に破棄確認を行う。

### workspaceDirty

作業位置・表示状態だけの変更。

例：

- Canvas Viewport
- 最後に開いていたCanvas

Workspace状態は保存対象としてよいが、`workspaceDirty` のみでは作品内容の未保存警告を出さない。Undo対象にも含めない。

Workspace状態は適切なタイミングで静かに保存するか、次回の通常保存に同梱する。Workspace状態だけが保存されなかった場合でも、作品内容が失われないことを優先する。

## 22.6 Auto Save

Auto SaveはUsable MVPで導入する。

変更後一定時間で保存する。

保存状態をUIに表示する。

例：

```text
Saved
Saving...
Unsaved changes
```

## 22.7 Backup

BackupはUsable MVPで導入する。

直近数世代の自動バックアップを保持する。

例：

```text
Backup 1
Backup 2
Backup 3
```

Backup世代数は実利用を見ながら調整する。

---

# 23. パフォーマンス方針

Card本文とCanvas描画状態を可能な限り分離する。

Card本文を1文字変更するたびにCanvas全体を再描画しない。

Canvas側では主に、

```text
title
tags
bodyPreview
position
```

を監視する。

本文編集は右サイドバー側でローカル編集状態を持ち、編集セッションの区切りでProject Dataへ反映する方式を優先する。

Store全体をコンポーネントから一括購読せず、必要なCard・Placement・Canvas等をID単位のselectorで購読する。

大規模Projectでも操作レスポンスを維持することを優先する。

---

# 24. Export

ExportはPolishフェーズで導入し、最初は機能を絞る。

## 24.1 PNG

以下を出力可能とする。

```text
現在表示範囲
選択範囲
Area
Canvas全体
```

## 24.2 PDF

Polishフェーズでは簡易PDF出力から検討する。

Canvasを1ページ画像としてPDF化する方式を基本とする。

本格的なA4/A3複数ページ分割は当面実装しない。

## 24.3 SVG

当面は実装しない。

必要性が確認された場合のみ追加する。

## 24.4 Project Data

バックアップ用途としてProject JSONを書き出せる仕様を検討する。

---

# 25. 初期実装範囲

本仕様では実装段階を以下の4フェーズに分ける。

- Phase 1：Core
- Phase 2：Usable MVP
- Phase 3：Multi-view
- Phase 4：Polish

「初期版」という曖昧な呼び方は避け、実装判断ではこのフェーズ名を使用する。

## Phase 1：Core

目的：データモデル・Canvas編集・保存が成立することを確認する内部基盤。

この段階は「Shepherd独自の使い勝手を評価する完成MVP」ではなく、壊れにくい基盤を作るための技術マイルストーンとする。

必須範囲：

```text
Project新規作成
初期Canvas 1の自動生成
Project名（未指定時 Untitled）

Card / Placementの内部分離
Canvas作成・切り替え
CanvasごとのViewport保持

Card作成
Cardタイトル編集
Card本文編集（プレーンテキスト）
Card固定標準サイズ
単一選択
Card移動
Canvas上からのDelete

Edge作成・削除
Edgeラベル編集
有向Edgeを標準
重複Edgeを許可
自己Edgeを禁止
上下左右Handleの自動選択

Zoom
Pan

Undo / Redo
履歴上限 約100操作
ViewportをUndo対象外とする

Open
Save
Save As
Atomic Save
formatVersion検証
不正Projectファイルのエラー表示

contentDirty / workspaceDirty
Saved / Unsaved changes表示
```

Card作成は内部的に「Card作成 + 現在CanvasへのPlacement作成」を1つの操作とする。

React Flow等のCanvasライブラリ固有Node構造をProject保存形式そのものとして使用しない。

## Phase 2：Usable MVP

目的：Shepherd固有の制作支援機能を揃え、実際の小説・ゲーム制作で使い勝手を評価できる最初のバージョンにする。

```text
Tag
Area
Area一括移動
Area折りたたみ
Area所属変更

START

複数選択
範囲選択
Copy / Paste

Canvas名変更・削除
Project Card一覧
Card完全削除

Canvas内検索
Project検索
Tagフィルター
Minimap

軽いグリッドスナップ
整列ガイド

Auto Save
Backup
```

Phase 2完了時点を最初の実用評価対象とする。

## Phase 3：Multi-view

目的：同一Cardを複数Canvasから扱うというShepherdのマルチキャンバス思想をUIとして完成させる。

```text
既存Cardを別Canvasへ配置
Card配置先一覧（Used In）
同じCardの複数Canvas間共有編集

Unplaced Cards

Back / Forwardナビゲーション
Canvas間ジャンプ
```

CardとPlacementのデータ構造上の分離はPhase 1から必須であり、Phase 3で新たに分離するものではない。

## Phase 4：Polish

目的：出力・閲覧・大規模Projectでの操作性を改善する。

```text
PNG Export
簡易PDF Export

Card表示モード
高度フィルター

任意Bookmark

Canvas複製・並び替え
操作性改善
パフォーマンス改善
```

各Phaseで保存フォーマットへ新しい永続フィールドを追加する場合は `formatVersion` とマイグレーションで対応する。

---

# 26. 当面実装しない機能

以下はCore〜Polishの優先範囲から除外し、実利用で必要性が確認された場合に再検討する。

```text
Project Relation
任意属性システム
Area入れ子
Canvas Home
Canvas Link専用カード
Card本文内リンク
細分化されたCard Type
SVG Export
複数ページPDF
高度な自動整列
クラウド同期
共同編集
ユーザー登録
AI文章生成
```

必要性が実際の利用から確認された場合のみ追加する。

---

# 27. 技術候補

第一候補：

```text
Tauri
React
TypeScript
@xyflow/react
Zustand
```

## 27.1 Tauri

主に以下を担当する。

```text
デスクトップアプリ化
ローカルファイル操作
保存・読み込み
Atomic Save
Export
```

ドメイン操作は可能な限りTypeScript側へ置き、Tauri/Rust側はファイルI/O等のOS依存処理へ限定する。

## 27.2 React

```text
UI
アプリケーションレイアウト
右編集パネル
ツールバー
サイドバー
```

## 27.3 TypeScript

```text
データモデル
アプリロジック
不変条件検証
保存形式との変換
```

## 27.4 @xyflow/react

```text
Infinite Canvas
Node表示
Edge表示
Pan
Zoom
Selection
MiniMap
```

React FlowのNode / Edge構造をProjectの永続データそのものにはしない。

```text
Card + Placement
        ↓ adapter
React Flow Node

Domain Edge
        ↓ adapter
React Flow Edge
```

React Flow Node IDにはPlacement IDを、React Flow Edge IDにはDomain Edge IDを使用する。

## 27.5 Zustand

Zustandはアプリ状態管理に使用する。

Storeを物理的に複数へ分けることは必須としない。初期実装では1つのStore内を責務ごとのsliceとして分けてもよい。

例：

```text
appStore
├─ project slice
│  ├─ Card
│  ├─ Canvas
│  ├─ Placement
│  ├─ Edge
│  └─ Area / Tag（後続Phase）
│
├─ session slice
│  ├─ 選択状態
│  ├─ 現在Canvas
│  └─ 一時UI状態
│
└─ history slice
   ├─ Undo
   └─ Redo
```

永続Projectデータと一時UI状態は論理的に分離する。

内部Storeでは頻繁なID検索に備え、Card・Canvas・Placement・Edge等をIDベースで正規化してよい。保存時は読みやすい配列形式へ変換し、読み込み時に正規化する構成を推奨する。

Undo / Redoの内部方式はライブラリや実装都合で選択し、独自patch形式を仕様として強制しない。

---

# 28. データ構造案

以下は完成時の概念モデルである。

実際のProjectファイルは `formatVersion` に応じて段階的に拡張する。CoreからTag・Area・Bookmarkの空配列を先行追加する必要はない。

## 28.1 ProjectFile

```ts
ProjectFile {
  formatVersion

  project
  workspace
}
```

## 28.2 ProjectData

```ts
ProjectData {
  id
  title

  cards[]
  canvases[]

  tags[]?              // Usable MVP以降
  startBookmarkId?     // Usable MVP以降
  bookmarks[]?         // STARTまたはPolish以降

  createdAt
  updatedAt
}
```

## 28.3 WorkspaceState

```ts
WorkspaceState {
  lastOpenedCanvasId
}
```

CanvasごとのViewportはCanvas側へ保持する。

WorkspaceStateの変更は `workspaceDirty` とし、作品内容の未保存警告には使用しない。

## 28.4 Canvas

```ts
Canvas {
  id
  title

  placements[]
  edges[]

  areas[]?             // Usable MVP以降

  viewport
}
```

## 28.5 Card

```ts
Card {
  id

  title
  body

  tags[]?              // Usable MVP以降

  createdAt
  updatedAt
}
```

## 28.6 Placement

```ts
Placement {
  id

  cardId
  canvasId

  position {
    x
    y
  }

  size {
    width
    height
  }

  areaId?              // Usable MVP以降
}
```

## 28.7 Area

```ts
Area {
  id
  canvasId

  title
  color
  tags[]

  anchorX
  anchorY

  collapsed
}
```

Areaは固定矩形のwidth / heightを持たない。

## 28.8 Edge

```ts
Edge {
  id
  canvasId

  sourcePlacementId
  targetPlacementId

  label
  direction
}
```

```ts
EdgeDirection = "directed" | "undirected"
```

Coreでは `directed` を標準とする。

Handle位置は保存しない。

## 28.9 Bookmark

```ts
Bookmark {
  id

  canvasId
  targetPlacementId?

  viewport
  title
}
```

STARTはBookmarkの特殊形として扱ってよい。

## 28.10 Core保存形式の最小要件

Coreの保存形式では最低限以下を保持する。

```text
formatVersion
Project ID / title / timestamps
Cards
Canvases
Placements
Edges
Canvas Viewports
lastOpenedCanvasId
```

Tag・Area・Bookmark等は、それぞれの実装Phaseでマイグレーションを伴って追加する。

---

# 29. 設計上の重要原則

## 29.1 CardとPlacementを分ける

Cardは情報そのもの。

Placementは、

「このCardを、このCanvasの、この位置に置いている」

という表示状態。

同じCardを複数Canvasから参照できる。

## 29.2 内部構造をユーザーへ押し付けない

ユーザーはCard InstanceやPlacementといった内部概念を理解する必要はない。

UI上では、

```text
カードを作る
既存カードを配置する
キャンバスから外す
完全に削除する
```

という操作として表現する。

## 29.3 Areaは箱ではなく集合

Areaは固定された四角形ではない。

Areaに所属するPlacementの集合が先にあり、その集合を囲む背景が結果として描画される。

```text
所属
↓
表示領域
```

であって、

```text
領域
↓
所属
```

ではない。

## 29.4 AreaとTagの役割を分ける

Area：

```text
Canvas上での一つのまとまり
```

Tag：

```text
情報が持つ意味・性質
```

例：

```text
Area = 第一章

Tags =
#Alice
#王都
#伏線
```

## 29.5 Edgeを単純に保つ

```text
フロー
人物関係
勢力関係
時系列
```

などを別データ型に分けない。

すべてCanvas上のEdgeとして扱う。

## 29.6 自由配置を優先する

Canvasは図表作成規則を強制する場所ではなく、思考・構想を空間的に整理する場所とする。

自動整列は補助機能に留める。

## 29.7 データを失わないことを最優先する

以下を基本要件とする。

```text
Atomic Save
Auto Save（Usable MVP以降）
Backup（Usable MVP以降）
Undo / Redo
formatVersion
```

## 29.8 操作速度を優先する

本アプリの主要操作は、

```text
作る
置く
動かす
つなぐ
まとめる
探す
別の見方へ移動する
```

である。

これらの操作をできるだけ少ないクリック・入力で実行できることを優先する。

## 29.9 データ不変条件

Store action、Project読み込み、マイグレーション時には以下を保証する。

1. Placementが参照するCardは必ず存在する。
2. Placementが参照するCanvasは必ず存在する。
3. Edgeの接続元・接続先Placementは必ず存在する。
4. Edgeと両端Placementは同じCanvasに属する。
5. 同一Canvas内に同じCard IDのPlacementを複数作らない。
6. Projectには常に1つ以上のCanvasが存在する。
7. `lastOpenedCanvasId` は存在するCanvasを指す。
8. Placementの `areaId` が設定されている場合、そのAreaは同じCanvasに属する。
9. BookmarkがPlacementを指す場合、そのPlacementはBookmarkのCanvasに属する。
10. Core / Usable MVPでは自己Edgeを作らない。
11. Card完全削除・Placement削除では、参照不能なPlacement / Edgeを残さない。

不正Projectファイルを読み込んだ場合は、黙ってデータを補完・破棄せず、明示的なエラーまたは安全なマイグレーションを行う。

---

# 30. 本アプリの中心的な利用フロー

## 情報を作る

```text
Card作成
↓
タイトル・本文・タグを書く
```

## 空間へ配置する

```text
Canvasへ配置
↓
自由に移動
```

## 関係を作る

```text
Card同士をEdgeで接続
```

## まとまりを作る

```text
Areaへ所属
```

## 情報を別の見方で再利用する

```text
既存Cardを別Canvasへ配置
```

## 必要な情報を探す

```text
Search
Tag
Area
```

## 位置を移動する

```text
Canvas一覧
Used In
Back / Forward
START
```

---

# 31. 本アプリの特徴

一般的なフローチャートアプリとの主な違いは以下。

1. Cardに長文本文を保持できる。
2. Tagによって物語情報を横断検索できる。
3. AreaによってCard群へ意味のあるまとまりを与えられる。
4. 一つのProjectに複数Canvasを作成できる。
5. 同じCardを複数Canvasへ配置できる。
6. Canvas間で同一情報を共有できる。
7. Plot・人物相関・時系列・勢力図等を同じProject Dataから構築できる。
8. Cardを未配置状態でも保持でき、アイデア置き場として利用できる。
9. STARTとナビゲーション履歴により巨大なProject内を移動できる。
10. 小説・ゲーム・シナリオ制作時の思考整理を主用途とする。

本アプリの最終的な目的は、

「物語に関する情報をカードとして蓄積し、それらを複数の空間的な見方から整理・接続・再利用できる制作環境」

を提供することである。