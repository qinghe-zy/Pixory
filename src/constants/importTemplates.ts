export interface ImportTemplate {
  key: string;
  name: string;
  groupName: string;
  tags: string[];
  note: string;
  isFavorite: boolean;
}

export const IMPORT_TEMPLATES: ImportTemplate[] = [
  {
    key: 'character-standee',
    name: '角色立绘',
    groupName: '角色立绘',
    tags: ['角色', '立绘'],
    note: '角色展示素材',
    isFavorite: true,
  },
  {
    key: 'festival-event',
    name: '节日活动',
    groupName: '节日活动',
    tags: ['节日', '活动'],
    note: '节日活动素材',
    isFavorite: false,
  },
  {
    key: 'operation-poster',
    name: '运营海报',
    groupName: '运营海报',
    tags: ['运营', '海报'],
    note: '运营投放素材',
    isFavorite: false,
  },
  {
    key: 'scene-art',
    name: '场景图',
    groupName: '场景图',
    tags: ['场景', '背景'],
    note: '场景与背景素材',
    isFavorite: false,
  },
  {
    key: 'stickers',
    name: '表情包',
    groupName: '表情包',
    tags: ['表情包', '社媒'],
    note: '表情与轻量传播素材',
    isFavorite: false,
  },
];
