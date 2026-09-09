# Content diversity gates

These CLIs are deterministic and read-only. They do not fetch WordPress, publish content, or write a corpus.

## Published-body similarity corpus

The existing directory-only invocation remains valid:

```bash
npx tsx scripts/similarity-gate.ts article_final.md --corpus /absolute/lane_queue
```

To compare with published bodies, pass a runtime-generated inventory as well:

```bash
npx tsx scripts/similarity-gate.ts article_final.md \
  --corpus /absolute/lane_queue \
  --published-inventory /absolute/runtime/published_articles.json
```

The inventory contract is:

```json
{
  "schema_version": 1,
  "synced_at": "2026-09-09T10:00:00+09:00",
  "source": { "site": "https://ownersoffice.co.jp" },
  "posts": [
    {
      "id": 42,
      "link": "https://ownersoffice.co.jp/example/",
      "modified": "2026-09-09T09:00:00+09:00",
      "content_html": "<h2>...</h2><p>...</p>",
      "content_sha256": "<lowercase SHA-256 of the exact UTF-8 content_html>"
    }
  ]
}
```

The gate rejects missing bodies, digest mismatches, duplicate IDs or links, cross-origin links, non-public URL forms, and oversized input. HTML is normalized locally and deterministically. Output contains only public provenance and the body digest, never the body. Keep the inventory in the runtime data location; do not commit published bodies to this repository.

## Source-enforced article type

`meta.yaml` must use one of `解説型`, `比較・判断型`, `手順型`, `Q&A型`, or `ケース型`, and bind that choice to the exact evidence source:

```yaml
slug: executive-compensation-tax-points
keyword: 役員報酬の決め方と税務上の留意点
created_at: "2026-09-09T10:00:00+09:00"
article_type: 比較・判断型
article_type_source:
  path: evidence_pack.md
  sha256: "<lowercase SHA-256 of the exact UTF-8 file>"
  basis: both # keyword_intent | evidence_pack | both
  rationale: 比較条件を求める検索意図と複数の判断軸を含む根拠に基づく。
```

Run the gate before writing the article:

```bash
npx tsx scripts/article-type-gate.ts /absolute/run/meta.yaml \
  --source /absolute/run/evidence_pack.md \
  --history /absolute/lane_queue
```

The default maximum is two consecutive articles of the same type. Missing or invalid history metadata, duplicate slug/timestamp provenance, a changed source, or a third consecutive type exits with status 2. `--max-consecutive` may be set from 1 to 20 when the caller has an explicit policy, but the gate never infers or repairs metadata.
