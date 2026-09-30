import PinyinMatch from 'pinyin-match';

export interface SearchAction {
  id: string;
  title: string;
  icon: string;
  aliases: string[];
  route: string;
  routeParams?: any;
}

export const GLOBAL_ACTIONS: SearchAction[] = [
  // 1. AI 陪伴与记忆
  {
    id: 'create-role',
    title: '新建角色卡',
    icon: 'person-add-outline',
    aliases: ['捏人', '新人物', '创建', '加角色', '老婆', '老公', '陪伴', '设定', '导入角色', '卡片'],
    route: 'ai-role-card-editor'
  },
  {
    id: 'role-library',
    title: '角色库',
    icon: 'people-outline',
    aliases: ['所有人物', '角色列表', '图鉴', '大家', '朋友', '谁', '全部角色', '找人', '管理角色'],
    route: 'ai-role-library'
  },
  {
    id: 'ai-provider-settings',
    title: '模型与 API 设置',
    icon: 'hardware-chip-outline',
    aliases: ['API Key', '换模型', 'DeepSeek', 'OpenAI', 'Gemini', 'Claude', '密钥', '服务商', '算力', '智商'],
    route: 'ai-provider-settings'
  },
  {
    id: 'inner-life',
    title: '内心生活',
    icon: 'heart-half-outline',
    aliases: ['日记', '梦境', '思绪', '想什么', '回忆', '心情', '独白', '内心', '秘密', '睡着了'],
    route: 'companion-inner-life'
  },
  {
    id: 'memory-board',
    title: '深度记忆',
    icon: 'brain-outline',
    aliases: ['看板', '他记住了什么', '记忆库', '忘记', '长期记忆', '印象', '关系', '记得我', '修改记忆'],
    route: 'ai-memory-board'
  },
  {
    id: 'knowledge-base',
    title: 'AI 知识库',
    icon: 'library-outline',
    aliases: ['资料', 'RAG', '喂饭', '调教文档', '上下文', '背景故事', '语料库', 'PDF', 'TXT', '记忆材料'],
    route: 'ai-knowledge-base'
  },

  // 2. 资产与整理归纳
  {
    id: 'create-ip',
    title: '新建 IP 企划',
    icon: 'folder-open-outline',
    aliases: ['新项目', '开坑', '作品', '系列', '新企划', '添加项目', '档案', '专辑', '宇宙'],
    route: 'create-ip'
  },
  {
    id: 'import-media',
    title: '导入素材',
    icon: 'cloud-upload-outline',
    aliases: ['添加图片', '传视频', '加文件', '相册导入', '拉素材', '上传', '加图', '存图', '压缩包'],
    route: 'import-images'
  },
  {
    id: 'all-images',
    title: '全部素材',
    icon: 'images-outline',
    aliases: ['所有照片', '图库', '视频', '全部', '找图', '相册', '所有内容', '随便看', '所有媒体'],
    route: 'all-images'
  },
  {
    id: 'global-groups',
    title: '全局分组',
    icon: 'grid-outline',
    aliases: ['目录', '分类', '找分组', '类别', '大纲', '分发', '归类', '相册薄', '大类'],
    route: 'global-groups'
  },
  {
    id: 'tags-overview',
    title: '标签管理',
    icon: 'pricetags-outline',
    aliases: ['全部标签', 'tag', '整理', '过滤', '关键词', '属性', '打标', '类别'],
    route: 'tags-overview'
  },
  {
    id: 'favorites',
    title: '我的收藏',
    icon: 'heart-outline',
    aliases: ['喜欢', '红心', '点赞', '星标', '珍藏', '爱看', '最爱', '精选', '特殊'],
    route: 'favorites'
  },
  {
    id: 'quick-organize',
    title: '快速整理',
    icon: 'flash-outline',
    aliases: ['未分类', '打标签', '没归类', '快速分配', '待办', '清库存', '分流', '打理', '整理没分类的'],
    route: 'quick-organize'
  },
  {
    id: 'batch-manage',
    title: '批量管理',
    icon: 'copy-outline',
    aliases: ['整理', '多选', '移动', '全选', '一键', '大扫除', '批量操作', '归纳'],
    route: 'batch-manage-images'
  },

  // 3. 系统工具与存储安全
  {
    id: 'settings',
    title: '系统设置',
    icon: 'settings-outline',
    aliases: ['选项', '偏好', '系统配置', '外观', '深色模式', '调整', '自定义', '开关', '基本设置'],
    route: 'settings'
  },
  {
    id: 'privacy-security',
    title: '密码与安全',
    icon: 'lock-closed-outline',
    aliases: ['密码', '安全', '上锁', '解锁', '私密', '保护', '隐藏', '个人空间', '里世界', '防爆破'],
    route: 'password-security-settings'
  },
  {
    id: 'storage-usage',
    title: '存储空间',
    icon: 'server-outline',
    aliases: ['容量', '内存', '清理', '垃圾', '占用', '多大', '清缓存', '瘦身', '满了', '空间分析'],
    route: 'storage-usage'
  },
  {
    id: 'duplicate-review',
    title: '重复检查',
    icon: 'layers-outline',
    aliases: ['去重', '删重复', '多余', '相同', '清理重复', '查重', '一样', '找茬', '重复图'],
    route: 'duplicate-review'
  },
  {
    id: 'backup',
    title: '数据备份',
    icon: 'save-outline',
    aliases: ['备份', '恢复', '导出', '防丢', '换手机', '保命', '数据转移', '存档', '迁移'],
    route: 'backup'
  },
  {
    id: 'trash',
    title: '回收站',
    icon: 'trash-outline',
    aliases: ['垃圾桶', '删掉的', '恢复删除', '后悔药', '误删', '过期', '找回', '彻底删除'],
    route: 'trash'
  },
  {
    id: 'import-history',
    title: '导入记录',
    icon: 'time-outline',
    aliases: ['批次', '历史记录', '传过什么', '上次', '复盘', '成功', '失败', '什么时候传的'],
    route: 'import-batch-history'
  },

  {
    id: 'system-assistant-toggle',
    title: 'Pixory 系统管家',
    icon: 'construct-outline',
    aliases: ['pixory', '管家', '助手', '系统助手', '系统', '设置管家', '开启系统管家', '关闭系统管家', '官方', 'AI管家', '小助手'],
    route: 'system-assistant-toggle'
  },

  // 4. 帮助与支持
  {
    id: 'about',
    title: '关于 Pixory',
    icon: 'information-circle-outline',
    aliases: ['版本', '更新', '官网', '版权', '升级', '介绍', '新功能', '成就', '彩蛋', '检查更新'],
    route: 'about'
  },
  {
    id: 'manual',
    title: '产品说明',
    icon: 'book-outline',
    aliases: ['怎么用', '教程', '指南', '帮助', '手册', '说明', '答疑', '不懂', '看说明书', '文档'],
    route: 'product-doc'
  }
];

export interface MatchedAction extends SearchAction {
  matchedAlias?: string;
}

export function searchActions(query: string): MatchedAction[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  const results: MatchedAction[] = [];

  for (const action of GLOBAL_ACTIONS) {
    if (PinyinMatch.match(action.title, keyword)) {
      results.push(action);
      continue;
    }

    let foundAlias = false;
    for (const alias of action.aliases) {
      if (PinyinMatch.match(alias, keyword)) {
        results.push({ ...action, matchedAlias: alias });
        foundAlias = true;
        break;
      }
    }
  }

  return results;
}

export function getRandomRecommendedActions(count: number): SearchAction[] {
  const shuffled = [...GLOBAL_ACTIONS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
