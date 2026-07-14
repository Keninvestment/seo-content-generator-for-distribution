# finalProofreadingAgents（11 体 MultiAgent 校閲）

**正本置き場**。元は `seo-content-generator-for-distribution/services/finalProofreadingAgents` として存在した TypeScript。**`seo-content-generator-for-distribution/services/finalProofreadingAgents` は本ディレクトリへのシンボリックリンク**なので、アプリ側の import パスは従来どおり。

- 依存: Gemini 等・既存サービスレイヤと同様（親パッケージのコンパイルコンテキスト内でビルド）。

Python 側の軽い校閲パイプラインは **親の `review_pipeline.py`**（`ReviewAgentListOrchestrator`）。TS とはプロトコルのみ概念対応（Refs #1512）。
