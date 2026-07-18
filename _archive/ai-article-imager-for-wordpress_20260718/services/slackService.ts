// Slack通知サービス（画像生成エージェント用）

interface SlackMessage {
  text: string;
  attachments?: Array<{
    color: "good" | "warning" | "danger" | string;
    title?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
    footer?: string;
    ts?: number;
  }>;
}

class SlackService {
  private readonly SLACK_NOTIFY_URL = `${
    import.meta.env.VITE_API_URL || "http://localhost:3001/api"
  }/slack-notify`;
  private readonly MENTION_USER_ID = import.meta.env.VITE_SLACK_MENTION_USER_ID || ""; // 環境変数から取得

  /**
   * Slack通知を送信
   */
  private async send(message: SlackMessage): Promise<void> {
    try {
      const apiKey = import.meta.env.VITE_INTERNAL_API_KEY;
      const response = await fetch(this.SLACK_NOTIFY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { "x-api-key": apiKey }),
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("❌ Slack通知の送信に失敗しました:", error);
      } else {
        console.log("✅ Slack通知を送信しました");
      }
    } catch (error) {
      console.error("❌ Slack通知エラー:", error);
      // エラーが発生しても処理は継続
    }
  }

  /**
   * 画像生成完了通知
   */
  async notifyImageGenerationComplete(data: {
    keyword: string;
    imageCount: number;
    processingTime: number; // 秒単位
  }): Promise<void> {
    const minutes = Math.floor(data.processingTime / 60);
    const seconds = data.processingTime % 60;
    const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

    const message: SlackMessage = {
      text: `🎨 *画像生成完了*`,
      attachments: [
        {
          color: "good",
          fields: [
            {
              title: "キーワード",
              value: data.keyword,
              short: true,
            },
            {
              title: "生成画像数",
              value: `${data.imageCount}枚`,
              short: true,
            },
            {
              title: "処理時間",
              value: timeStr,
              short: true,
            },
            {
              title: "ステータス",
              value: "✅ 正常完了",
              short: true,
            },
          ],
          footer: "Image Generator Agent",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }

  /**
   * WordPress入稿完了通知（メンション付き）
   */
  async notifyWordPressPostComplete(data: {
    title: string;
    postUrl: string;
    imageCount: number;
    status?: "draft" | "publish";
    metaDescription?: string;
    slug?: string;
  }): Promise<void> {
    const statusText = data.status === "publish" ? "公開済み" : "下書き保存";

    const message: SlackMessage = {
      text: `<@${this.MENTION_USER_ID}>\n📝 *WordPress投稿完了*`,
      attachments: [
        {
          color: "good",
          fields: [
            {
              title: "タイトル",
              value: data.title,
              short: false,
            },
            {
              title: "URL",
              value: data.postUrl,
              short: false,
            },
            {
              title: "メタディスクリプション",
              value: data.metaDescription || "（未設定）",
              short: false,
            },
            {
              title: "スラッグ",
              value: data.slug || "（自動生成）",
              short: false,
            },
            {
              title: "画像数",
              value: `${data.imageCount}枚`,
              short: true,
            },
            {
              title: "ステータス",
              value: statusText,
              short: true,
            },
          ],
          footer: "WordPress Publisher",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }

  /**
   * エラー通知
   */
  async notifyError(data: {
    step: string;
    error: string;
    keyword?: string;
  }): Promise<void> {
    const message: SlackMessage = {
      text: `❌ *エラーが発生しました*`,
      attachments: [
        {
          color: "danger",
          fields: [
            {
              title: "発生箇所",
              value: data.step,
              short: true,
            },
            ...(data.keyword
              ? [
                  {
                    title: "キーワード",
                    value: data.keyword,
                    short: true,
                  },
                ]
              : []),
            {
              title: "エラー内容",
              value: data.error,
              short: false,
            },
          ],
          footer: "Image Generator Agent",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }
}

// シングルトンインスタンスをエクスポート
export const slackService = new SlackService();
