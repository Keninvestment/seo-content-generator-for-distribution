/**
 * マルチエージェント校閲のドメイン別プロンプト断片（KEN 専門領域チューニング）。
 * context.domainVertical === "ken-tax-invest" のときのみ有効。
 */

const KEN_TAX_INVEST_BLOCK = `
【KEN専門領域モード（税務・投資）】
- 税務: 条文・税率・期限・届出は e-Gov法令検索・国税庁タックスアンサー等の一次情報と突合。条文番号や施行日は推測せず、不明なら「要確認」として major 以上の issue にする。
- 投資: 金融商品取引法・投資助言・リスク説明。利回りや元本保証の断定表現は法令・景表の観点から厳しく見る。
- 暗号資産: 「暗号資産」表記。所得区分（雑所得・譲渡所得・事業所得等）を記事が断定している場合は根拠URLまたは「税務上の個別判断」と注記するよう提案する。
- 日付: 申告期限・納付期限・法定申告書提出期限は年度・暦年を取り違えない。
`;

export function taxInvestVerticalPrompt(context?: { domainVertical?: string }): string {
  if (!context || context.domainVertical !== "ken-tax-invest") {
    return "";
  }
  return KEN_TAX_INVEST_BLOCK;
}
