export interface PetModel {
  id: string;
  name: string;
  url: string;
  zipUrl?: string;
  motions?: string[];
  category?: string;
  semantic?: { tap?: string };
  hitAreas?: string[];
}

export const PET_MODELS: PetModel[] = [
  {
    id: 'live2d-nahida@main',
    category: 'Genshin / Honkai (原神 / 崩坏)',
    name: 'nahida',
    url: 'https://cdn.jsdelivr.net/gh/whatqiu/Live2d-nahida@main/nahida.model3.json',
    zipUrl: 'https://mist01.com/live2d/live2d-nahida@main.zip'
  },
  {
    id: 'hutao-live2d@main',
    category: 'Genshin / Honkai (原神 / 崩坏)',
    name: 'Hu Tao',
    url: 'https://cdn.jsdelivr.net/gh/zeankundev/HuTao-Live2D@main/Hu%20Tao.model3.json',
    zipUrl: 'https://mist01.com/live2d/hutao-live2d@main.zip'
  },
  {
    id: 'mako',
    category: 'Yuzusoft (柚子社)',
    name: 'mako1',
    url: 'https://cdn.jsdelivr.net/gh/guyutongxue/Live2DModel@master/mako/mako1.model.json',
    zipUrl: 'https://mist01.com/live2d/mako.zip'
  },
  {
    id: 'sakyu',
    category: 'Yuzusoft (柚子社)',
    name: 'sakyu',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/kiss/sakyu/sakyu.model.json',
    zipUrl: 'https://mist01.com/live2d/sakyu.zip'
  },
  {
    id: 'sakyu_1',
    category: 'Yuzusoft (柚子社)',
    name: 'sakyu',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/mainmenu/sakyu/sakyu.model.json',
    zipUrl: 'https://mist01.com/live2d/sakyu_1.zip'
  },
  {
    id: 'yu',
    category: 'Yuzusoft (柚子社)',
    name: 'yu',
    url: 'https://cdn.jsdelivr.net/gh/guyutongxue/Live2DModel@master/yu/yu.model3.json',
    zipUrl: 'https://mist01.com/live2d/yu.zip'
  },
  {
    id: 'syokusyu',
    category: 'Yuzusoft (柚子社)',
    name: 'Syokusyu',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/Syokusyu/Syokusyu.model.json',
    zipUrl: 'https://mist01.com/live2d/syokusyu.zip'
  },
  {
    id: 'ane',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'ane',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/kiss/ane/ane.model.json',
    zipUrl: 'https://mist01.com/live2d/ane.zip'
  },
  {
    id: 'nurse',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'nurse',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/mainmenu/nurse/nurse.model.json',
    zipUrl: 'https://mist01.com/live2d/nurse.zip'
  },
  {
    id: 'goth',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'goth',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/kiss/goth/goth.model.json',
    zipUrl: 'https://mist01.com/live2d/goth.zip'
  },
  {
    id: 'micro',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'micro',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/itizen/micro/micro.model.json',
    zipUrl: 'https://mist01.com/live2d/micro.zip'
  },
  {
    id: 'closer',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'closer',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/h/closer/closer.model.json',
    zipUrl: 'https://mist01.com/live2d/closer.zip'
  },
  {
    id: 'himo',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'himo',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/kiss/himo/himo.model.json',
    zipUrl: 'https://mist01.com/live2d/himo.zip'
  },
  {
    id: 'akira',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'akira_st02_w',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/LOVE%C2%B3-LOVE%20CUBE-/live2d/akira/akira_st02_w.model3.json',
    zipUrl: 'https://mist01.com/live2d/akira.zip'
  },
  {
    id: 'ero',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'ero',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/kiss/ero/ero.model.json',
    zipUrl: 'https://mist01.com/live2d/ero.zip'
  },
  {
    id: 'facehaga',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'facehaga',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/facehaga/facehaga.model.json',
    zipUrl: 'https://mist01.com/live2d/facehaga.zip'
  },
  {
    id: 'bosstensi',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'BossTensi',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/BossTensi/BossTensi.model.json',
    zipUrl: 'https://mist01.com/live2d/bosstensi.zip'
  },
  {
    id: 'res',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char_cg_live2d_h015/res/.model.json',
    zipUrl: 'https://mist01.com/live2d/res.zip'
  },
  {
    id: 'char_cg_live2d_007',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char_cg_live2d_007/.model.json',
    zipUrl: 'https://mist01.com/live2d/char_cg_live2d_007.zip'
  },
  {
    id: 'res_1',
    category: 'Anime / Others (知名动漫)',
    name: 'sardyamodel',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char2d_live2d_001/res/sardyamodel.model.json',
    zipUrl: 'https://mist01.com/live2d/res_1.zip'
  },
  {
    id: '001_miku_romecin',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/BanG%20Dream%21/asneeded/live2d/chara/001/001_miku_romecin/.model.json',
    zipUrl: 'https://mist01.com/live2d/001_miku_romecin.zip'
  },
  {
    id: 'res_2',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char_cg_live2d_005/res/.model.json',
    zipUrl: 'https://mist01.com/live2d/res_2.zip'
  },
  {
    id: 'iori',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'iori_st02_w',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/LOVE%C2%B3-LOVE%20CUBE-/live2d/iori/iori_st02_w.model3.json',
    zipUrl: 'https://mist01.com/live2d/iori.zip'
  },
  {
    id: 'mako_1',
    category: 'Yuzusoft (柚子社)',
    name: 'mako1',
    url: 'https://cdn.jsdelivr.net/gh/guyutongxue/Live2DModel@master/mako/mako1.model3.json',
    zipUrl: 'https://mist01.com/live2d/mako_1.zip'
  },
  {
    id: 'akira_1',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'akira_st02_rw',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/LOVE%C2%B3-LOVE%20CUBE-/live2d/akira/akira_st02_rw.model3.json',
    zipUrl: 'https://mist01.com/live2d/akira_1.zip'
  },
  {
    id: 'res_3',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char_cg_live2d_059/res/.model.json',
    zipUrl: 'https://mist01.com/live2d/res_3.zip'
  },
  {
    id: 'sakyu_2',
    category: 'Yuzusoft (柚子社)',
    name: 'sakyu',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/itizen/sakyu/sakyu.model.json',
    zipUrl: 'https://mist01.com/live2d/sakyu_2.zip'
  },
  {
    id: '15',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'sharedassets15.assets',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/UnHolY%20ToRturEr/sharedassets15.assets/15/sharedassets15.assets.model3.json',
    zipUrl: 'https://mist01.com/live2d/15.zip'
  },
  {
    id: 'res_4',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/boss_cg_live2d_002/res/.model.json',
    zipUrl: 'https://mist01.com/live2d/res_4.zip'
  },
  {
    id: 'seihuku',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'seihuku',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/mainmenu/seihuku/seihuku.model.json',
    zipUrl: 'https://mist01.com/live2d/seihuku.zip'
  },
  {
    id: 'res_5',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char_cg_live2d_h021/res/.model.json',
    zipUrl: 'https://mist01.com/live2d/res_5.zip'
  },
  {
    id: 'ane_1',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'ane',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/mainmenu/ane/ane.model.json',
    zipUrl: 'https://mist01.com/live2d/ane_1.zip'
  },
  {
    id: '001_2018_dog',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/BanG%20Dream%21/asneeded/live2d/chara/001/001_2018_dog/.model.json',
    zipUrl: 'https://mist01.com/live2d/001_2018_dog.zip'
  },
  {
    id: 'apron',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'apron',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/kiss/apron/apron.model.json',
    zipUrl: 'https://mist01.com/live2d/apron.zip'
  },
  {
    id: 'boss_cg_live2d_h004',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/boss_cg_live2d_h004/.model.json',
    zipUrl: 'https://mist01.com/live2d/boss_cg_live2d_h004.zip'
  },
  {
    id: 'gadhian',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'gadhian',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/gadhian/gadhian.model.json',
    zipUrl: 'https://mist01.com/live2d/gadhian.zip'
  },
  {
    id: 'res_6',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char_cg_live2d_h016/res/.model.json',
    zipUrl: 'https://mist01.com/live2d/res_6.zip'
  },
  {
    id: 'cheer',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'cheer',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/nade/cheer/cheer.model.json',
    zipUrl: 'https://mist01.com/live2d/cheer.zip'
  },
  {
    id: 'seijoi',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'Seijoi',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/Seijoi/Seijoi.model.json',
    zipUrl: 'https://mist01.com/live2d/seijoi.zip'
  },
  {
    id: 'ero_1',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'ero',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/nade/ero/ero.model.json',
    zipUrl: 'https://mist01.com/live2d/ero_1.zip'
  },
  {
    id: 'char_cg_live2d_049',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/char_cg_live2d_049/.model.json',
    zipUrl: 'https://mist01.com/live2d/char_cg_live2d_049.zip'
  },
  {
    id: 'umisyokusyu',
    category: 'Yuzusoft (柚子社)',
    name: 'UmiSyokusyu',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/UmiSyokusyu/UmiSyokusyu.model.json',
    zipUrl: 'https://mist01.com/live2d/umisyokusyu.zip'
  },
  {
    id: 'mori_miko',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'mori_miko',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/Fox%20Hime%20Zero/mori_miko/mori_miko.model3.json',
    zipUrl: 'https://mist01.com/live2d/mori_miko.zip'
  },
  {
    id: 'res_7',
    category: 'Anime / Others (知名动漫)',
    name: '',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Sacred%20Sword%20princesses/boss_cg_live2d_004/res/.model.json',
    zipUrl: 'https://mist01.com/live2d/res_7.zip'
  },
  {
    id: 'maid',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'maid',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/kiss/maid/maid.model.json',
    zipUrl: 'https://mist01.com/live2d/maid.zip'
  },
  {
    id: 'senko_normals',
    category: 'Anime / Others (知名动漫)',
    name: 'senko',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/Live2D/Senko_Normals/senko.model3.json',
    zipUrl: 'https://mist01.com/live2d/senko_normals.zip'
  },
  {
    id: 'b1',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'b1',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B200228%5D%20%5BNorth%20Box%5D%20%E3%83%A2%E3%83%8E%E3%83%8E%E7%B3%BB%E5%BD%BC%E5%A5%B3/b1/b1.model3.json',
    zipUrl: 'https://mist01.com/live2d/b1.zip'
  },
  {
    id: 'maid_1',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'maid',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/mainmenu/maid/maid.model.json',
    zipUrl: 'https://mist01.com/live2d/maid_1.zip'
  },
  {
    id: 'mk',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'mk',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%82%81%E3%81%8C%E3%81%BF%E3%81%9D%E3%81%B5%E3%81%A8%5D%20%E3%80%90Live2D%E3%80%91%E3%82%B3%E3%83%B3%E7%8B%90%E3%81%A8%E3%81%AE%E6%97%A5%E5%B8%B8%2B%28%E3%81%B7%E3%82%89%E3%81%99%29/itizen/mk/mk.model.json',
    zipUrl: 'https://mist01.com/live2d/mk.zip'
  },
  {
    id: 'danmenzuyr',
    category: 'Galgame / Visual Novel (视觉小说)',
    name: 'DanmenzuYR',
    url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/%5B%E3%81%AC%E3%81%B7%E7%AB%9C%E3%81%AE%E9%87%8C%5D%20%E3%83%AB%E3%82%A4%E3%83%B3%E3%82%BA%E3%82%B7%E3%83%BC%E3%82%AB%E3%83%BC%20live2d/DanmenzuYR/DanmenzuYR.model.json',
    zipUrl: 'https://mist01.com/live2d/danmenzuyr.zip'
  },
];
