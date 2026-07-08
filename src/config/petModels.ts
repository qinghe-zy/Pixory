export interface PetModel {
  id: string;
  name: string;
  url: string;
  zipUrl?: string;
  motions?: string[];
  category?: string;
  semantic?: { tap?: string }; // 抄自 Expressions[].Name
  hitAreas?: string[]; // 点击区域
}

export const PET_MODELS: PetModel[] = [
  {
    id: 'shizuku',
    category: '基础看板',
    semantic: { tap: 'tap_body' },
    name: '雫 (Shizuku)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json',
    zipUrl: 'https://mist01.com/live2d/shizuku.zip'
  },
  {
    id: 'wanko',
    category: '基础看板',
    semantic: { tap: 'tap_body' },
    name: '汪可 (Wanko)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-wanko@1.0.5/assets/wanko.model.json',
    zipUrl: 'https://mist01.com/live2d/wanko.zip'
  },
  {
    id: 'koharu',
    category: '基础看板',
    name: '小春 (Koharu)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-koharu@1.0.5/assets/koharu.model.json',
    zipUrl: 'https://mist01.com/live2d/koharu.zip'
  },
  {
    id: 'hibiki',
    category: '基础看板',
    name: '响 (Hibiki)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-hibiki@1.0.5/assets/hibiki.model.json',
    zipUrl: 'https://mist01.com/live2d/hibiki.zip'
  },
  {
    id: 'izumi',
    category: '基础看板',
    name: '泉 (Izumi)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-izumi@1.0.5/assets/izumi.model.json',
    zipUrl: 'https://mist01.com/live2d/izumi.zip'
  },
  {
    id: 'tororo',
    category: '基础看板',
    name: '托罗罗 (Tororo)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-tororo@1.0.5/assets/tororo.model.json',
    zipUrl: 'https://mist01.com/live2d/tororo.zip'
  },
  {
    id: 'chitose',
    category: '基础看板',
    name: '千岁 (Chitose)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-chitose@1.0.5/assets/chitose.model.json',
    zipUrl: 'https://mist01.com/live2d/chitose.zip'
  },
  {
    id: 'miku',
    category: '知名动漫',
    name: '初音未来 (Miku)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-miku@1.0.5/assets/miku.model.json',
    zipUrl: 'https://mist01.com/live2d/miku.zip'
  },
  {
    id: 'tsumiki',
    category: '其他',
    name: '积木 (Tsumiki)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-tsumiki@1.0.5/assets/tsumiki.model.json',
    zipUrl: 'https://mist01.com/live2d/tsumiki.zip'
  },
  {
    id: 'z16',
    category: '游戏角色',
    name: 'Z16 (少女前线/战舰少女)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-z16@1.0.5/assets/z16.model.json',
    zipUrl: 'https://mist01.com/live2d/z16.zip'
  },
  {
    id: 'nico',
    category: '其他',
    name: '妮可 (Nico)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-nico@1.0.5/assets/nico.model.json',
    zipUrl: 'https://mist01.com/live2d/nico.zip'
  },
  {
    id: 'nipsilon',
    category: '其他',
    name: '尼普西隆 (Nipsilon)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-nipsilon@1.0.5/assets/nipsilon.model.json',
    zipUrl: 'https://mist01.com/live2d/nipsilon.zip'
  },
  {
    id: 'nito',
    category: '其他',
    name: '尼托 (Nito)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-nito@1.0.5/assets/nito.model.json',
    zipUrl: 'https://mist01.com/live2d/nito.zip'
  },
  {
    id: 'unitychan',
    category: '其他',
    name: 'Unity酱 (Unity-chan)',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-unitychan@1.0.5/assets/unitychan.model.json',
    zipUrl: 'https://mist01.com/live2d/unitychan.zip'
  },
  {
    id: 'bang_dream_dog',
    category: '游戏角色',
    name: '邦邦 - 狗 (BanG Dream)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/BanG%20Dream!/asneeded/live2d/chara/001/001_2018_dog/.model.json',
    zipUrl: 'https://mist01.com/live2d/bang_dream_dog.zip'
  },
  {
    id: 'bang_dream_miku',
    category: '游戏角色',
    name: '邦邦 - 初音 (BanG Dream)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/BanG%20Dream!/asneeded/live2d/chara/001/001_miku_romecin/.model.json',
    zipUrl: 'https://mist01.com/live2d/bang_dream_miku.zip'
  },
  {
    id: 'gorem',
    category: '知名动漫',
    name: '蕾姆 (Rem)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/Gorem/Gorem.model.json',
    zipUrl: 'https://mist01.com/live2d/gorem.zip'
  },
  {
    id: 'fox_mori',
    category: '知名动漫',
    name: '茉莉 (Fox Hime)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/Fox%20Hime%20Zero/mori_miko/mori_miko.model3.json',
    zipUrl: 'https://mist01.com/live2d/fox_mori.zip'
  },
  {
    id: 'fox_ruri',
    category: '知名动漫',
    name: '琉璃 (Fox Hime)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/Fox%20Hime%20Zero/ruri_miko/ruri_miko.model3.json',
    zipUrl: 'https://mist01.com/live2d/fox_ruri.zip'
  },
  {
    id: 'love3_akira',
    category: '知名动漫',
    name: '晶 (Akira)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/LOVE%C2%B3-LOVE%20CUBE-/live2d/akira/akira_st01_w.model3.json',
    zipUrl: 'https://mist01.com/live2d/love3_akira.zip'
  },
  {
    id: 'love3_iori',
    category: '知名动漫',
    name: '伊织 (Iori)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/LOVE%C2%B3-LOVE%20CUBE-/live2d/iori/iori_st01_w.model3.json',
    zipUrl: 'https://mist01.com/live2d/love3_iori.zip'
  },
  {
    id: 'love3_nodoka',
    category: '知名动漫',
    name: '和香 (Nodoka)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/LOVE%C2%B3-LOVE%20CUBE-/live2d/nodoka/nodoka_st01_w.model3.json',
    zipUrl: 'https://mist01.com/live2d/love3_nodoka.zip'
  },
  {
    id: 'senko',
    category: '知名动漫',
    semantic: { tap: 'Tap' },
    name: '仙狐 (Senko)',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Live2D/Senko_Normals/senko.model3.json',
    zipUrl: 'https://mist01.com/live2d/senko.zip'
  }
];
