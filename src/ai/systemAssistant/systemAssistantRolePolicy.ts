import type { SystemRoleCreationSession } from './systemAssistantTypes';

export function detectSystemRoleIntent(text: string): 'start' | 'finish' | 'cancel' | null {
  const request = text.trim();
  // Only the current user's direct request can authorize a task; quoted examples are data.
  if (!request || request.length > 4000 || /^(?:[「『“"`])|(?:举例|例如|假如|这句话|翻译|解释)/.test(request)) return null;
  if (/^(?:算了|取消(?:创建|制作|角色卡|角色|任务)?|不(?:创建|做|要)了|停止(?:创建|制作))\s*[吧。！!]*(?:$|[,，。]\s*(?:先|我们|聊|换|不聊))/.test(request)
    || /(?:取消|停止|放弃)(?:这次|这个|当前)?(?:角色卡|角色|伙伴)?(?:的)?(?:创建|制作)/.test(request)) return 'cancel';
  if (/(?:不要|别|不想|不用|暂不|先不|先别|还不|不能|不可以|不确认|不确定).{0,12}(?:创建|保存|制作|新建|生成|执行|操作|动手|提交)|(?:如何|怎么|哪里|在哪|教程|入口|编辑器)/.test(request)) return null;
  if (/^(?:好[的吧]?[,，。\s]*)?(?:就这样[吧了]?|就按(?:刚才|前面|这些|这个|我们讨论的)(?:说的|设定)?|确定|确认|可以|直接|现在)?[,，\s]*(?:帮我|为我)?(?:创建|保存|生成)(?:这张|这个)?(?:角色卡|角色|伙伴|它|吧|了)?[吧了。！!\s]*$/.test(request)
    || /^(?:就按|按)(?:刚才|前面|我们讨论的|这个|这些)(?:说的|讨论的|设定|方案)?[,，\s]*(?:帮我|直接|现在)?(?:创建|保存|生成)(?:这张|这个)?(?:角色卡|角色|伙伴)?[吧了。！!\s]*$/.test(request)) return 'finish';
  if (/(?:帮我|替我|为我|我想|我要|想要|请|一起|给我).{0,20}(?:创建|新建|制作|设计|生成|做|捏).{0,16}(?:角色卡|角色|伙伴|人物)/.test(request)
    || /^(?:创建|新建|制作|设计|生成|做|捏).{0,16}(?:角色卡|角色|伙伴|人物)/.test(request)) return 'start';
  return null;
}

export function isSystemRoleCreationQuestion(reply: string): boolean {
  const lastSentence = reply.trim().split(/[。！!\n]/).filter(Boolean).at(-1)?.trim() ?? '';
  if (/(?:不创建|不保存|不要创建|不要保存|别创建|别保存)/.test(lastSentence.replace(/要不要/g, '是否'))) return false;
  return /^(?:那|那么|现在|要|需要|可以|是否|要不要|确定|确认|我们|我|帮你|为你|就|按这些设定|按这个设定|按刚才的设定|把它|把这个角色|把这张角色卡|将它|将这个角色|将这张角色卡|这个|这张|这位|直接|正式|进行|保存|创建|成|角色卡|角色|伙伴|吗|呢|吧|好|[，,\s？?])+$/.test(lastSentence)
    && /(?:创建|保存).*(?:吗|是否|[？?])|(?:是否|要不要).*(?:创建|保存)/.test(lastSentence);
}

export function nextSystemRoleSession(input: {
  space: SystemRoleCreationSession['space']; userMessageId: string; requestText: string;
  previous: SystemRoleCreationSession | null; now: string;
}): SystemRoleCreationSession | null {
  const intent = detectSystemRoleIntent(input.requestText);
  if (intent === 'cancel') return null;
  const previous = input.previous?.space === input.space ? input.previous : null;
  const startingAnother = /(?:另一个|另一张|新的角色|新角色)/.test(input.requestText)
    && (intent === 'start' || intent === 'finish');
  if (!previous || previous.phase === 'created' || startingAnother) {
    if (intent !== 'start' && intent !== 'finish') return previous;
    if (previous?.phase === 'created' && intent === 'finish' && !startingAnother) return previous;
    // Replaying the original create request must not create a second role.
    if (previous?.id === input.userMessageId) return previous;
    return { version: 1, space: input.space, id: input.userMessageId, phase: 'collecting', draft: null,
      lastUserMessageId: input.userMessageId, authorizedMessageId: null, roleCardId: null, updatedAt: input.now };
  }
  const shortConfirmation = previous.awaitingConfirmation === true && Boolean(previous.draft?.name && previous.draft?.prompt)
    && /^(?:好的?|好吧|可以|确认|确定|是的?|嗯|就这样[吧了]?)[。！!\s]*$/.test(input.requestText.trim());
  const request = input.requestText.trim();
  const pause = !intent && !shortConfirmation && (
    /(?:先放着|先放一放|晚点再|稍后再|暂停|先聊别的|换个话题|先不聊|先做别的)/.test(request)
    || /^(?:你好|嗨|谢谢|再见|早上好|晚上好)[呀啊。！!\s]*$/.test(request)
    || !/角色|设定|开场白|出生/.test(request) && /几点|几号|星期几|周几|(?:现在|今天|当地|查|查询|告诉我).{0,8}(?:时间|日期)/.test(request)
    || /(?:打开|查看|进入|前往|设置|备份|导入|清理|查重|更新|切换|更换).{0,12}(?:素材|图库|回收站|设置|模型|API|空间|版本|收藏|标签|分组|角色库|编辑器|IP|数据|记忆|文档|资料|知识库|手册|官网|教程|日记|梦境)/i.test(request)
    || /^(?:请|帮我|先|麻烦)*\s*(?:备份|导入|查重|检查更新)[一下吧。！!\s]*$/.test(request));
  const resume = Boolean(intent) || /(?:继续|接着|恢复).{0,8}(?:角色|设定|共创)|(?:角色|设定).{0,8}(?:继续|恢复)|性格|开场白|相处方式|名字改成/.test(request);
  const paused = pause || (previous.paused === true && !resume);
  return { ...previous, lastUserMessageId: input.userMessageId,
    authorizedMessageId: !paused && (intent === 'finish' || shortConfirmation) && previous.id !== input.userMessageId ? input.userMessageId : null,
    awaitingConfirmation: false,
    paused,
    updatedAt: input.now };
}
