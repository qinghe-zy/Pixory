import { initDatabase, type PixorySpace } from '../../database';
import {
  deleteImMessage as repoDeleteImMessage,
  truncateDownstreamMessages as repoTruncateDownstreamMessages,
} from '../repository/imThreadRepository';

export const imMessageRollback = {
  /**
   * 删除单条消息
   */
  async deleteMessage(messageId: string, space: PixorySpace): Promise<void> {
    await repoDeleteImMessage(space, messageId);
  },

  /**
   * 截断该消息之后的所有后续对话记录（用于编辑历史消息重发）
   */
  async truncateAfterMessage(
    threadId: string,
    targetMessageCreatedAt: string,
    space: PixorySpace
  ): Promise<void> {
    await repoTruncateDownstreamMessages(space, threadId, targetMessageCreatedAt);
  },

  /**
   * 用户插话打断：物理截断所有未来未显影的气泡
   */
  async cancelFuturePendingBubbles(
    threadId: string,
    space: PixorySpace,
    now: number = Date.now()
  ): Promise<number> {
    const db = await initDatabase(space);
    const result = await db.runAsync(
      'DELETE FROM ai_messages WHERE threadId = ? AND visible_at > ?',
      threadId,
      now
    );
    return result.changes ?? 0;
  },
};
