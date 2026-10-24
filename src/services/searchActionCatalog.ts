export type FeatureCategory =
  | 'ai_companion'
  | 'asset_organize'
  | 'system_security'
  | 'help_support';

export type SystemPromptCategory =
  | 'basic'
  | 'asset_organize'
  | 'ai_companion'
  | 'system_help';

export interface SystemAssistantFeatureConfig {
  /** 是否允许系统管家跳转该入口（默认 true） */
  enabled?: boolean;
  /** 系统管家动作卡片显示的标题（默认复用功能 title） */
  actionTitle?: string;
  /** 所属系统管家 Prompt 分组（默认根据 category 自动映射） */
  promptCategory?: SystemPromptCategory;
  /** 是否自动写入系统管家 Prompt 列表（默认 true；特殊 IP 动作可设为 false） */
  autoPrompt?: boolean;
  /** 完整的自定义 Prompt 行描述（不含标签行）；若不填则基于 title 与 promptHint/aliases 自动生成 */
  promptDescription?: string;
  /** 附加在标签行之后的补充说明（如新建角色卡的共创规则说明） */
  extraPromptNote?: string;
  /** 触发时机简述，如“当用户要求调整性能设置、流式输出模式时”；不填则自动取 aliases 前几项生成 */
  promptHint?: string;
  /** 模型输出 route 时的兼容英文/简写别名（会自动补充中划线与下划线互转版本） */
  routeAliases?: string[];
  /** 是否支持携带 ipName / ipId 范围 */
  ipScoped?: boolean;
  /** 是否启用本地意图兜底恢复（默认 true） */
  autoRecover?: boolean;
  /** 本地意图恢复优先顺序（越小越先匹配，默认 100；子设置项可设更小值以优先于通用“系统设置”） */
  recoverOrder?: number;
  /** 自定义意图恢复正则（匹配 request + reply 全文）；若不填则自动基于 title + aliases 构造 */
  intentPattern?: RegExp;
  /** 自定义单句短指令恢复正则（仅匹配 request 原文） */
  exactRequestPattern?: RegExp;
}

export interface SearchableFeatureEntry {
  id: string;
  title: string;
  icon: string;
  route: string;
  routeParams?: Record<string, unknown>;
  category: FeatureCategory;
  /** 全局搜索匹配词（支持拼音与关键词匹配），同时作为系统管家 Prompt 与意图恢复的默认词库 */
  aliases: string[];
  /** 是否在全局搜索功能卡片与“猜你喜欢”中展示（默认 true） */
  enableInGlobalSearch?: boolean;
  /** Pixory 系统管家联动配置（默认开启并自动派生路由白名单、Prompt 与意图恢复） */
  systemAssistant?: SystemAssistantFeatureConfig;
}

/**
 * 全局可搜索功能与系统管家可跳转入口的单一事实来源（Single Source of Truth）。
 *
 * 新增可搜索/可跳转功能时，只需在此数组中添加一项配置：
 * 1. 全局搜索卡片与“猜你喜欢”会自动收录（除非 enableInGlobalSearch: false）；
 * 2. 系统管家路由白名单与别名会自动注册（除非 systemAssistant.enabled: false）；
 * 3. 系统管家系统提示词（System Prompt）会自动注入对应 XML 动作标签；
 * 4. 系统管家本地意图恢复（漏标兜底）会自动根据 intentPattern 或 title/aliases 生效。
 */
export const SEARCHABLE_FEATURE_CATALOG: readonly SearchableFeatureEntry[] = [
  // ==========================================
  // 1. AI 陪伴与记忆 (ai_companion)
  // ==========================================
  {
    id: 'create-role',
    title: '新建角色卡',
    icon: 'person-add-outline',
    route: 'ai-role-card-editor',
    category: 'ai_companion',
    aliases: ['捏人', '新人物', '创建', '加角色', '老婆', '老公', '陪伴', '设定', '导入角色', '卡片', '角色卡编辑器', '编辑角色卡', '新伙伴', '新建伙伴'],
    systemAssistant: {
      actionTitle: '新建角色卡',
      routeAliases: ['role-card-editor', 'create-role'],
      promptDescription: '打开角色卡编辑器（仅用户明确要求手动编辑、打开编辑器或新建入口时）',
      extraPromptNote: '- 用户要求你帮忙创建角色卡或伙伴时，应在系统提供的角色卡共创任务内自然追问、记录完整设定，不把请求转换为打开编辑器。共创草稿动作由当前任务规则定义。',
      intentPattern: /(?:角色卡编辑器|新建角色卡|创建角色卡编辑器|创建角色卡|编辑角色卡|新伙伴|新建伙伴)/i,
    },
  },
  {
    id: 'role-library',
    title: '角色库',
    icon: 'people-outline',
    route: 'ai-role-library',
    category: 'ai_companion',
    aliases: ['所有人物', '角色列表', '图鉴', '大家', '朋友', '谁', '全部角色', '找人', '管理角色', '所有伙伴', '查看伙伴', '伙伴列表', '伙伴库'],
    systemAssistant: {
      actionTitle: '角色库',
      routeAliases: ['role-library', 'roles'],
      promptHint: '当用户要求打开角色库、图鉴、查看所有伙伴时',
      intentPattern: /(?:角色库|所有伙伴|查看伙伴|图鉴|伙伴列表|看伙伴|伙伴库)/i,
      exactRequestPattern: /^(?:角色|伙伴)$/i,
    },
  },
  {
    id: 'ai-provider-settings',
    title: '模型与 API 设置',
    icon: 'hardware-chip-outline',
    route: 'ai-provider-settings',
    category: 'ai_companion',
    aliases: ['API Key', '换模型', 'DeepSeek', 'OpenAI', 'Gemini', 'Claude', '密钥', '服务商', '算力', '智商', '全局默认模型', '模型设置', '切换模型', '大模型设置'],
    systemAssistant: {
      actionTitle: '模型与 API 设置',
      routeAliases: ['provider-settings', 'model-settings', 'providers', 'models'],
      promptDescription: '模型与API设置（当用户要求换模型、修改API Key、配置全局默认模型时）',
      recoverOrder: 40,
      intentPattern: /(?:模型设置|api\s*设置|模型与\s*api|全局默认模型|换模型|切换模型|修改\s*api|配置模型|大模型设置|服务商设置)/i,
    },
  },
  {
    id: 'inner-life',
    title: '内心生活',
    icon: 'heart-half-outline',
    route: 'companion-inner-life',
    category: 'ai_companion',
    aliases: ['日记', '梦境', '思绪', '想什么', '回忆', '心情', '独白', '内心', '秘密', '睡着了'],
    systemAssistant: {
      enabled: false,
    },
  },
  {
    id: 'memory-board',
    title: '深度记忆',
    icon: 'brain-outline',
    route: 'ai-memory-board',
    category: 'ai_companion',
    aliases: ['看板', '他记住了什么', '记忆库', '忘记', '长期记忆', '印象', '关系', '记得我', '修改记忆'],
    systemAssistant: {
      enabled: false,
    },
  },
  {
    id: 'knowledge-base',
    title: 'AI 知识库',
    icon: 'library-outline',
    route: 'ai-knowledge-base',
    category: 'ai_companion',
    aliases: ['资料', 'RAG', '喂饭', '调教文档', '上下文', '背景故事', '语料库', 'PDF', 'TXT', '记忆材料'],
    systemAssistant: {
      enabled: false,
    },
  },

  // ==========================================
  // 2. 资产与整理归纳 (asset_organize)
  // ==========================================
  {
    id: 'create-ip',
    title: '新建 IP 企划',
    icon: 'folder-open-outline',
    route: 'create-ip',
    category: 'asset_organize',
    aliases: ['新项目', '开坑', '作品', '系列', '新企划', '添加项目', '档案', '专辑', '宇宙', '新建IP', '创建IP'],
    systemAssistant: {
      actionTitle: '新建 IP',
      promptCategory: 'basic',
      routeAliases: ['new-ip'],
      promptDescription: '新建 IP（当用户明确表示要新建或创建一个IP或企划时）',
      intentPattern: /(?:新建|创建).*(?:ip|企划)/i,
    },
  },
  {
    id: 'ip-detail',
    title: '打开 IP',
    icon: 'folder-outline',
    route: 'ip-detail',
    category: 'asset_organize',
    aliases: ['查看IP', '进入IP'],
    enableInGlobalSearch: false,
    systemAssistant: {
      actionTitle: '打开 IP',
      routeAliases: ['open-ip'],
      ipScoped: true,
      autoPrompt: false,
      autoRecover: false,
    },
  },
  {
    id: 'import-media',
    title: '导入素材',
    icon: 'cloud-upload-outline',
    route: 'import-images',
    category: 'asset_organize',
    aliases: ['添加图片', '传视频', '加文件', '相册导入', '拉素材', '上传', '加图', '存图', '压缩包'],
    systemAssistant: {
      actionTitle: '导入素材',
      routeAliases: ['import'],
      ipScoped: true,
      autoPrompt: false,
      autoRecover: false,
    },
  },
  {
    id: 'all-images',
    title: '全部素材',
    icon: 'images-outline',
    route: 'all-images',
    category: 'asset_organize',
    aliases: ['所有照片', '图库', '视频', '全部', '找图', '相册', '所有内容', '随便看', '所有媒体', '所有素材', '全部图片'],
    systemAssistant: {
      actionTitle: '全部素材',
      routeAliases: ['images', 'photos', 'gallery'],
      ipScoped: true,
      promptHint: '当用户要求查看所有素材、图库、所有照片时',
      intentPattern: /(?:全部素材|所有素材|查看所有图片|照片库|所有相片|看图|看照片|打开相册|浏览素材|所有图片|全部图片|全部相片)/i,
      exactRequestPattern: /^(?:相册|全部素材|看图)$/i,
    },
  },
  {
    id: 'global-groups',
    title: '全局分组',
    icon: 'grid-outline',
    route: 'global-groups',
    category: 'asset_organize',
    aliases: ['目录', '分类', '找分组', '类别', '大纲', '分发', '归类', '相册薄', '大类', '全部分组', '分组管理', '分组列表'],
    systemAssistant: {
      actionTitle: '全部分组',
      routeAliases: ['groups', 'group'],
      promptHint: '当用户要求打开全部分组、分类时',
      intentPattern: /(?:全部分组|全局分组|分组管理|查看分组|分组列表)/i,
      exactRequestPattern: /^(?:分组|分组管理|全局分组)$/i,
    },
  },
  {
    id: 'tags-overview',
    title: '标签管理',
    icon: 'pricetags-outline',
    route: 'tags-overview',
    category: 'asset_organize',
    aliases: ['全部标签', 'tag', '整理', '过滤', '关键词', '属性', '打标', '类别', '所有标签', '标签列表'],
    systemAssistant: {
      actionTitle: '标签管理',
      routeAliases: ['tags', 'tag'],
      promptHint: '当用户要求查看所有标签、标签管理时',
      intentPattern: /(?:标签管理|所有标签|查看标签|标签列表|全部标签)/i,
      exactRequestPattern: /^(?:标签|标签管理)$/i,
    },
  },
  {
    id: 'favorites',
    title: '我的收藏',
    icon: 'heart-outline',
    route: 'favorites',
    category: 'asset_organize',
    aliases: ['喜欢', '红心', '点赞', '星标', '珍藏', '爱看', '最爱', '精选', '特殊', '收藏夹', '查看收藏'],
    systemAssistant: {
      actionTitle: '我的收藏',
      routeAliases: ['favorite', 'fav'],
      promptHint: '当用户要求查看收藏、红心、喜欢的图片时',
      intentPattern: /(?:我的收藏|查看收藏|收藏夹|喜欢的图片|红心|看收藏|打开收藏|所有收藏)/i,
      exactRequestPattern: /^(?:收藏|我的收藏)$/i,
    },
  },
  {
    id: 'quick-organize',
    title: '快速整理',
    icon: 'flash-outline',
    route: 'quick-organize',
    category: 'asset_organize',
    aliases: ['未分类', '打标签', '没归类', '快速分配', '待办', '清库存', '分流', '打理', '整理没分类的', '未整理素材'],
    systemAssistant: {
      actionTitle: '未整理素材',
      routeAliases: ['organize'],
      ipScoped: true,
      promptHint: '当用户要求整理没分类的图、快速归类时',
      intentPattern: /(?:快速整理|未整理素材|未分类素材|整理素材|待整理)/i,
    },
  },
  {
    id: 'batch-manage',
    title: '批量管理',
    icon: 'copy-outline',
    route: 'batch-manage-images',
    category: 'asset_organize',
    aliases: ['整理', '多选', '移动', '全选', '一键', '大扫除', '批量操作', '归纳', '批量整理'],
    systemAssistant: {
      actionTitle: '批量管理',
      routeAliases: ['batch-manage'],
      ipScoped: true,
      promptHint: '当用户要求批量操作、批量管理时',
      intentPattern: /(?:批量管理|批量操作|批量整理)/i,
    },
  },

  // ==========================================
  // 3. 系统工具与存储安全 (system_security)
  // ==========================================
  {
    id: 'lock-personal-space',
    title: '锁定隐私空间',
    icon: 'lock-closed-outline',
    route: 'lock-personal-space',
    category: 'system_security',
    aliases: ['锁定空间', '退出隐私空间', '锁定个人空间'],
    enableInGlobalSearch: false,
    systemAssistant: {
      actionTitle: '锁定隐私空间',
      promptCategory: 'basic',
      routeAliases: ['lock-privacy', 'lock'],
      promptHint: '当用户要求锁定、保护隐私、退出个人空间时',
      recoverOrder: 10,
      intentPattern: /(?:锁定隐私空间|锁定空间|退出隐私空间|锁定个人空间|锁上|锁住|上锁|锁定隐私)/i,
      exactRequestPattern: /^(?:锁定|锁屏)$/i,
    },
  },
  {
    id: 'performance-settings',
    title: '性能设置',
    icon: 'speedometer-outline',
    route: 'performance-settings',
    category: 'system_security',
    aliases: ['性能', '流畅度', '流式输出', '推流', '打字机', '连续平滑推流', '机械打字机', '长消息折叠', '历史长消息智能折叠', '排版优化', '卡顿', '掉帧', '帧率'],
    systemAssistant: {
      actionTitle: '性能设置',
      routeAliases: ['performance', 'perf-settings'],
      promptHint: '当用户要求调整性能设置、流式输出呈现、打字机模式或长消息折叠时',
      recoverOrder: 30,
      intentPattern: /(?:性能设置|流式输出|平滑推流|机械打字机|打字机模式|长消息智能折叠|长消息折叠|排版优化)/i,
      exactRequestPattern: /^(?:性能|性能设置)$/i,
    },
  },
  {
    id: 'appearance-settings',
    title: '外观设置',
    icon: 'color-palette-outline',
    route: 'appearance-settings',
    category: 'system_security',
    aliases: ['外观', '主题', '样式', '侧边栏', 'AI侧边栏', '推挤缩放', '经典覆盖', '抽屉样式', '界面样式', '视觉', '皮肤', '深色模式'],
    systemAssistant: {
      actionTitle: '外观设置',
      routeAliases: ['appearance', 'theme-settings', 'sidebar-style'],
      promptHint: '当用户要求调整外观设置、AI侧边栏样式、推挤缩放或经典覆盖抽屉时',
      recoverOrder: 30,
      intentPattern: /(?:外观设置|侧边栏样式|推挤缩放|经典覆盖|抽屉样式|界面样式|主题外观)/i,
      exactRequestPattern: /^(?:外观|外观设置)$/i,
    },
  },
  {
    id: 'chat-appearance-settings',
    title: '聊天视觉定制',
    icon: 'chatbubble-ellipses-outline',
    route: 'chat-appearance-settings',
    category: 'system_security',
    aliases: [
      '聊天视觉',
      '聊天外观',
      '气泡颜色',
      '微信绿',
      '气泡圆角',
      '头像圆角',
      '聊天排版',
      '聊天字号',
      '字距',
      '行距',
      '段间距',
      '字体大小',
      '聊天字体',
      '气泡风格',
      '聊天色卡',
      '微信风格',
    ],
    systemAssistant: {
      actionTitle: '聊天视觉定制',
      routeAliases: ['chat-appearance', 'bubble-style', 'chat-typography'],
      promptHint: '当用户要求调整聊天气泡颜色、气泡圆角、头像圆角、字号、字距、行距或段间距时',
      recoverOrder: 25,
      intentPattern: /(?:聊天视觉|气泡颜色|微信绿|气泡圆角|头像圆角|聊天排版|聊天字号|字距|行距|段间距|气泡风格|聊天色卡)/i,
      exactRequestPattern: /^(?:聊天视觉|气泡设置|气泡颜色|聊天排版)$/i,
    },
  },
  {
    id: 'profile-info-settings',
    title: '个人信息',
    icon: 'person-circle-outline',
    route: 'profile-info-settings',
    category: 'system_security',
    aliases: [
      '个人信息',
      '个人资料',
      '修改昵称',
      '更换头像',
      '头像框',
      '头像圆角',
      '我的昵称',
      '修改名字',
      '改头像',
      '个人中心',
      '用户资料',
    ],
    systemAssistant: {
      actionTitle: '个人信息',
      routeAliases: ['profile-info', 'user-profile', 'profile-settings'],
      promptHint: '当用户要求修改个人资料、更换头像、修改昵称、开启头像框或调整头像圆角时',
      recoverOrder: 25,
      intentPattern: /(?:个人信息|个人资料|修改昵称|更换头像|头像框|头像圆角|修改名字|改头像)/i,
      exactRequestPattern: /^(?:个人信息|个人资料)$/i,
    },
  },
  {
    id: 'privacy-security',
    title: '密码与安全',
    icon: 'lock-closed-outline',
    route: 'password-security-settings',
    category: 'system_security',
    aliases: ['密码', '安全', '上锁', '解锁', '私密', '保护', '隐藏', '个人空间', '里世界', '防爆破', '修改密码', '恢复密钥', '安全设置'],
    systemAssistant: {
      actionTitle: '密码与安全',
      routeAliases: ['password-security', 'security-settings', 'privacy-security'],
      promptHint: '当用户要求打开密码与安全、修改隐私密码、查看恢复密钥时',
      recoverOrder: 30,
      intentPattern: /(?:密码与安全|安全设置|修改密码|隐私密码|恢复密钥|防爆破)/i,
      exactRequestPattern: /^(?:密码|密码与安全|安全设置)$/i,
    },
  },
  {
    id: 'advanced-settings',
    title: '更多设置',
    icon: 'options-outline',
    route: 'advanced-settings',
    category: 'system_security',
    aliases: ['高级设置', '数字身份', '身份凭证', '导出凭证', '载入凭证', '防伪私钥', 'UID凭证', '更多选项'],
    systemAssistant: {
      actionTitle: '更多设置',
      routeAliases: ['advanced', 'more-settings'],
      promptHint: '当用户要求打开更多设置、高级设置、导出或载入数字身份凭证时',
      recoverOrder: 30,
      intentPattern: /(?:更多设置|高级设置|数字身份|身份凭证|导出凭证|载入凭证)/i,
      exactRequestPattern: /^(?:更多设置|高级设置)$/i,
    },
  },
  {
    id: 'settings',
    title: '系统设置',
    icon: 'settings-outline',
    route: 'settings',
    category: 'system_security',
    aliases: ['选项', '偏好', '系统配置', '调整', '自定义', '开关', '基本设置', '通用设置', '应用设置', '软件设置'],
    systemAssistant: {
      actionTitle: '系统设置',
      routeAliases: ['setting'],
      promptHint: '当用户要求打开系统设置、通用偏好设置时',
      recoverOrder: 90,
      intentPattern: /(?:系统设置|打开设置|去设置|软件设置|应用设置|偏好设置|通用设置)/i,
      exactRequestPattern: /^(?:设置|系统设置|(?:打开|去|进入|查看)设置)$/i,
    },
  },
  {
    id: 'storage-usage',
    title: '存储空间',
    icon: 'server-outline',
    route: 'storage-usage',
    category: 'system_security',
    aliases: ['容量', '内存', '清理', '垃圾', '占用', '多大', '清缓存', '瘦身', '满了', '空间分析', '存储管理'],
    systemAssistant: {
      actionTitle: '存储空间',
      promptCategory: 'basic',
      routeAliases: ['storage', 'space'],
      promptDescription: '清理存储空间（当用户要求看空间、清理缓存、管理存储时）',
      recoverOrder: 10,
      intentPattern: /(?:存储|空间占用|清理存储|清理缓存|磁盘占用|清理空间|看下空间|查看空间|内存占用|占用空间|空间不足|空间满了|剩余空间|存储管理)/i,
      exactRequestPattern: /^(?:存储|空间|清理)$/i,
    },
  },
  {
    id: 'duplicate-review',
    title: '重复检查',
    icon: 'layers-outline',
    route: 'duplicate-review',
    category: 'system_security',
    aliases: ['去重', '删重复', '多余', '相同', '清理重复', '查重', '一样', '找茬', '重复图', '重复素材', '图片查重'],
    systemAssistant: {
      actionTitle: '检查重复素材',
      promptCategory: 'asset_organize',
      routeAliases: ['duplicate', 'duplicates'],
      promptDescription: '查重与清理重复图片（当用户要求清理重复图片、查重时）',
      intentPattern: /(?:查重|重复素材|检查重复|清理重复|素材查重|图片查重|图片去重|查找重复|重复检查)/i,
    },
  },
  {
    id: 'backup',
    title: '数据备份',
    icon: 'save-outline',
    route: 'backup',
    category: 'system_security',
    aliases: ['备份', '恢复', '导出', '防丢', '换手机', '保命', '数据转移', '存档', '迁移', '还原备份'],
    systemAssistant: {
      actionTitle: '数据备份',
      promptHint: '当用户要求备份数据、导出存档时',
      intentPattern: /(?:数据备份|备份数据|导出存档|导出数据|备份与还原|还原备份)/i,
      exactRequestPattern: /^(?:备份|导出)$/i,
    },
  },
  {
    id: 'trash',
    title: '回收站',
    icon: 'trash-outline',
    route: 'trash',
    category: 'system_security',
    aliases: ['垃圾桶', '删掉的', '恢复删除', '后悔药', '误删', '过期', '找回', '彻底删除', '废纸篓'],
    systemAssistant: {
      actionTitle: '回收站',
      promptCategory: 'basic',
      routeAliases: ['trash-bin', 'recycle-bin', 'recycle'],
      promptDescription: '打开回收站（当用户要求查看垃圾桶、回收站、已删除内容时）',
      recoverOrder: 5,
      intentPattern: /(?:回收站|垃圾桶|已删除|废纸篓|删掉的|被删的)/i,
    },
  },
  {
    id: 'import-history',
    title: '导入记录',
    icon: 'time-outline',
    route: 'import-batch-history',
    category: 'system_security',
    aliases: ['批次', '历史记录', '传过什么', '上次', '复盘', '成功', '失败', '什么时候传的', '导入历史'],
    systemAssistant: {
      actionTitle: '导入记录',
      routeAliases: ['import-history'],
      ipScoped: true,
      promptHint: '当用户要求查看最近导入历史、失败记录时',
      intentPattern: /(?:导入记录|导入历史|历史导入|批量记录)/i,
    },
  },
  {
    id: 'system-assistant-toggle',
    title: 'Pixory 系统管家',
    icon: 'construct-outline',
    route: 'system-assistant-toggle',
    category: 'system_security',
    aliases: ['pixory', '管家', '助手', '系统助手', '系统', '设置管家', '开启系统管家', '关闭系统管家', '官方', 'AI管家', '小助手'],
    systemAssistant: {
      enabled: false,
    },
  },

  // ==========================================
  // 4. 帮助与支持 (help_support)
  // ==========================================
  {
    id: 'about',
    title: '关于 Pixory',
    icon: 'information-circle-outline',
    route: 'about',
    category: 'help_support',
    aliases: ['版本', '更新', '官网', '版权', '升级', '介绍', '新功能', '成就', '彩蛋', '检查更新', '版本号'],
    systemAssistant: {
      actionTitle: '关于',
      promptDescription: '关于（当用户要求看版本、更新、官网、彩蛋等关于信息时）',
      intentPattern: /(?:关于|软件版本|关于页面|版本信息|版本号)/i,
      exactRequestPattern: /^(?:关于|版本)$/i,
    },
  },
  {
    id: 'manual',
    title: '产品说明',
    icon: 'book-outline',
    route: 'product-doc',
    category: 'help_support',
    aliases: ['怎么用', '教程', '指南', '帮助', '手册', '说明', '答疑', '不懂', '看说明书', '文档', '使用手册', '帮助文档'],
    systemAssistant: {
      actionTitle: '产品说明',
      routeAliases: ['docs'],
      promptHint: '当用户要求看教程、使用手册、不懂怎么用时',
      intentPattern: /(?:产品说明|使用手册|帮助文档|软件说明|使用指南|教程)/i,
      exactRequestPattern: /^(?:说明|使用手册|帮助|指南)$/i,
    },
  },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPromptCategory(entry: SearchableFeatureEntry): SystemPromptCategory {
  if (entry.systemAssistant?.promptCategory) {
    return entry.systemAssistant.promptCategory;
  }
  switch (entry.category) {
    case 'ai_companion':
      return 'ai_companion';
    case 'asset_organize':
      return 'asset_organize';
    case 'system_security':
    case 'help_support':
      return 'system_help';
  }
}

export function formatSystemAssistantPromptLine(entry: SearchableFeatureEntry): string {
  const cfg = entry.systemAssistant;
  const description = cfg?.promptDescription
    ?? `${entry.title}（${cfg?.promptHint ?? `当用户要求打开${entry.title}、${entry.aliases.slice(0, 4).join('、')}时`}）`;
  const baseLine = `- ${description}：\n  <system_action type="navigate" route="${entry.route}" />`;
  return cfg?.extraPromptNote ? `${baseLine}\n${cfg.extraPromptNote}` : baseLine;
}

const PROMPT_LINES_BY_CATEGORY: Record<SystemPromptCategory, string[]> = {
  basic: [],
  asset_organize: [],
  ai_companion: [],
  system_help: [],
};

for (const entry of SEARCHABLE_FEATURE_CATALOG) {
  if (entry.systemAssistant?.enabled === false || entry.systemAssistant?.autoPrompt === false) continue;
  PROMPT_LINES_BY_CATEGORY[getPromptCategory(entry)].push(formatSystemAssistantPromptLine(entry));
}

export function getSystemAssistantPromptLinesByCategory(category: SystemPromptCategory): string[] {
  return PROMPT_LINES_BY_CATEGORY[category];
}

export function buildSystemAssistantRoutesMap(): Record<string, string> {
  const routes: Record<string, string> = {};
  for (const entry of SEARCHABLE_FEATURE_CATALOG) {
    if (entry.systemAssistant?.enabled === false) continue;
    routes[entry.route] = entry.systemAssistant?.actionTitle ?? entry.title;
  }
  return routes;
}

export function buildSystemAssistantRouteAliasesMap(): Record<string, string> {
  const aliases: Record<string, string> = {};
  const register = (alias: string, targetRoute: string) => {
    const normalized = alias.trim().toLowerCase();
    if (!normalized) return;
    aliases[normalized] = targetRoute;
    aliases[normalized.replace(/-/g, '_')] = targetRoute;
  };
  for (const entry of SEARCHABLE_FEATURE_CATALOG) {
    if (entry.systemAssistant?.enabled === false) continue;
    register(entry.route, entry.route);
    for (const alias of entry.systemAssistant?.routeAliases ?? []) {
      register(alias, entry.route);
    }
  }
  return aliases;
}

export function buildIpScopedSystemRoutesSet(): Set<string> {
  const set = new Set<string>();
  for (const entry of SEARCHABLE_FEATURE_CATALOG) {
    if (entry.systemAssistant?.enabled === false) continue;
    if (entry.systemAssistant?.ipScoped) {
      set.add(entry.route);
    }
  }
  return set;
}

function buildFallbackIntentRegex(entry: SearchableFeatureEntry): RegExp {
  const terms = [entry.title, ...entry.aliases.filter(a => a.trim().length >= 2)].map(escapeRegExp);
  return new RegExp(`(?:${terms.join('|')})`, 'i');
}

interface PreparedRecoveryCandidate {
  route: string;
  intentRegex: RegExp;
  exactRegex: RegExp;
}

const PREPARED_RECOVERY_CANDIDATES: readonly PreparedRecoveryCandidate[] = SEARCHABLE_FEATURE_CATALOG
  .filter(entry => entry.systemAssistant?.enabled !== false && entry.systemAssistant?.autoRecover !== false)
  .slice()
  .sort((a, b) => (a.systemAssistant?.recoverOrder ?? 100) - (b.systemAssistant?.recoverOrder ?? 100))
  .map(entry => {
    const cfg = entry.systemAssistant;
    return {
      route: entry.route,
      intentRegex: cfg?.intentPattern ?? buildFallbackIntentRegex(entry),
      exactRegex: cfg?.exactRequestPattern ?? new RegExp(`^${escapeRegExp(entry.title)}$`, 'i'),
    };
  });

export function recoverSystemRouteFromCatalog(requestText: string, fullContext: string): string | null {
  const request = requestText.trim();
  for (const candidate of PREPARED_RECOVERY_CANDIDATES) {
    if (candidate.intentRegex.test(fullContext) || candidate.exactRegex.test(request)) {
      return candidate.route;
    }
  }
  return null;
}
