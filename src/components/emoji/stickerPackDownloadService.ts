/**
 * 按需下载扩展表情包服务 (Sticker Pack On-Demand Download Service)
 *
 * 核心设计：
 * 1. 预置四大主题扩展包，每包包含 30~35 款高精度微动效表情，以经典小黄脸为主体；
 * 2. 状态驱动：未下载 (not_installed) / 下载中 (downloading) / 已安装 (installed)；
 * 3. 下载流程：下载图片 -> 写入沙盒目录 AppData/stickers/packs/<packId>/ -> 写入 SQLite -> 注入 StickerSemanticResolver；
 * 4. 空间可控：支持一键卸载/删除特定包或全部已下载扩展包，瞬间释放磁盘空间；
 * 5. 设计克制规范：文案与按钮坚决不使用任何装饰性 Emoji 符号。
 */

import * as FileSystem from 'expo-file-system/legacy';
import type { PixorySpace } from '../../database';
import { getStickerPacksDir, getStickersDir } from '../../services/fileStorageService';
import { customStickerRepository } from '../../database/repositories/customStickerRepository';
import { runWithDatabaseSpace } from '../../database/db';
import {
  registerCustomStickers,
  unregisterPackStickers,
  type CoreEmotionBucket,
  type ResolvableStickerItem,
} from './StickerSemanticResolver';

const FLUENT_BASE = 'https://cdn.jsdelivr.net/gh/Tarikul-Islam-Anik/Animated-Fluent-Emojis@master/Emojis';

export interface StickerPackItemDef {
  id: string;
  name: string;
  pathSegment: string;
  bucket: CoreEmotionBucket;
}

export interface StickerPackManifest {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  estimatedSize: string;
  stickers: StickerPackItemDef[];
}

function makeFace(id: string, name: string, path: string, bucket: CoreEmotionBucket): StickerPackItemDef {
  return { id: `face_pro_${id}`, name, pathSegment: path, bucket };
}

function makePet(id: string, name: string, path: string, bucket: CoreEmotionBucket): StickerPackItemDef {
  return { id: `pet_pro_${id}`, name, pathSegment: path, bucket };
}

function makeProp(id: string, name: string, path: string, bucket: CoreEmotionBucket): StickerPackItemDef {
  return { id: `prop_pro_${id}`, name, pathSegment: path, bucket };
}

function makeGesture(id: string, name: string, path: string, bucket: CoreEmotionBucket): StickerPackItemDef {
  return { id: `gesture_pro_${id}`, name, pathSegment: path, bucket };
}

/**
 * 预置四大扩展表情包清单 (每包 30~35 款，小黄脸为主体，无任何 Emoji 符号修饰)
 */
export const PRESET_STICKER_PACKS: StickerPackManifest[] = [
  {
    id: 'pack_yellow_faces_pro',
    name: '经典小黄脸进阶包',
    description: '35 款高精度微表情小黄脸，涵盖生动丰富的社交互动神态',
    itemCount: 35,
    estimatedSize: '7.5 MB',
    stickers: [
      makeFace('melting', '融化溶化', 'Smilies/Melting%20Face.png', 'sleepy'),
      makeFace('salute', '立正敬礼', 'Smilies/Saluting%20Face.png', 'thumbsup'),
      makeFace('peeking', '掩面偷看', 'Smilies/Face%20with%20Peeking%20Eye.png', 'look'),
      makeFace('shaking', '疯狂摇头', 'Smilies/Shaking%20Face.png', 'surprised'),
      makeFace('dotted', '透明隐形', 'Smilies/Dotted%20Line%20Face.png', 'thinking'),
      makeFace('holding_back', '强忍泪水', 'Smilies/Face%20Holding%20Back%20Tears.png', 'pleading'),
      makeFace('diagonal_mouth', '嘴角抽动', 'Smilies/Face%20with%20Diagonal%20Mouth.png', 'tsundere'),
      makeFace('hand_mouth', '偷笑憋笑', 'Smilies/Face%20with%20Hand%20Over%20Mouth.png', 'laugh'),
      makeFace('open_eyes_hand', '震惊捂嘴', 'Smilies/Face%20with%20Open%20Eyes%20and%20Hand%20Over%20Mouth.png', 'surprised'),
      makeFace('screaming', '尖叫惊恐', 'Smilies/Face%20Screaming%20in%20Fear.png', 'surprised'),
      makeFace('yawning', '困倦哈欠', 'Smilies/Yawning%20Face.png', 'sleepy'),
      makeFace('partying', '礼花狂欢', 'Smilies/Partying%20Face.png', 'fire'),
      makeFace('woozy', '微醺晕乎', 'Smilies/Woozy%20Face.png', 'blush'),
      makeFace('hot_face', '满头大汗', 'Smilies/Hot%20Face.png', 'fire'),
      makeFace('cold_face', '冻成冰块', 'Smilies/Cold%20Face.png', 'heartbreak'),
      makeFace('exploding_head', '头皮发麻', 'Smilies/Exploding%20Head.png', 'bomb'),
      makeFace('cowboy', '牛仔快乐', 'Smilies/Cowboy%20Hat%20Face.png', 'laugh'),
      makeFace('disguised', '墨镜伪装', 'Smilies/Disguised%20Face.png', 'look'),
      makeFace('nerd', '学霸眼镜', 'Smilies/Nerd%20Face.png', 'thinking'),
      makeFace('monocle', '单镜探究', 'Smilies/Face%20with%20Monocle.png', 'thinking'),
      makeFace('rolling_eyes', '白眼望天', 'Smilies/Face%20with%20Rolling%20Eyes.png', 'tsundere'),
      makeFace('raised_eyebrow', '挑眉质疑', 'Smilies/Face%20with%20Raised%20Eyebrow.png', 'thinking'),
      makeFace('expressionless', '生无可恋', 'Smilies/Expressionless%20Face.png', 'tsundere'),
      makeFace('neutral', '中立看戏', 'Smilies/Neutral%20Face.png', 'look'),
      makeFace('smirking', '嘴角歪笑', 'Smilies/Smirking%20Face.png', 'tsundere'),
      makeFace('grimacing', '尴尬咧嘴', 'Smilies/Grimacing%20Face.png', 'surprised'),
      makeFace('relieved', '释怀满足', 'Smilies/Relieved%20Face.png', 'blush'),
      makeFace('sleepy_drop', '瞌睡气泡', 'Smilies/Sleepy%20Face.png', 'sleepy'),
      makeFace('drooling', '嘴馋口水', 'Smilies/Drooling%20Face.png', 'laugh'),
      makeFace('nauseated', '难受反胃', 'Smilies/Nauseated%20Face.png', 'heartbreak'),
      makeFace('sneezing', '纸巾喷嚏', 'Smilies/Sneezing%20Face.png', 'pleading'),
      makeFace('clown', '小丑自嘲', 'Smilies/Clown%20Face.png', 'laugh'),
      makeFace('ghost', '幽灵飘飘', 'Smilies/Ghost.png', 'look'),
      makeFace('alien', '外星外脑', 'Smilies/Alien.png', 'thinking'),
      makeFace('robot', '呆萌机器', 'Smilies/Robot.png', 'thinking'),
    ],
  },
  {
    id: 'pack_pets',
    name: '萌宠生灵陪伴包',
    description: '30 款治愈系猫咪、修狗、仓鼠与生灵微动效',
    itemCount: 30,
    estimatedSize: '6.2 MB',
    stickers: [
      makePet('cat_smile', '微笑猫猫', 'Smilies/Grinning%20Cat%20with%20Smiling%20Eyes.png', 'laugh'),
      makePet('cat_kiss', '亲吻猫猫', 'Smilies/Kissing%20Cat.png', 'kiss'),
      makePet('cat_heart', '爱心猫猫', 'Smilies/Smiling%20Cat%20with%20Heart-Eyes.png', 'kiss'),
      makePet('cat_weary', '惊呆猫猫', 'Smilies/Weary%20Cat.png', 'surprised'),
      makePet('cat_crying', '哭哭猫猫', 'Smilies/Crying%20Cat.png', 'pleading'),
      makePet('dog_guide', '温顺金毛', 'Animals/Guide%20Dog.png', 'pat'),
      makePet('dog_poodle', '卷毛贵宾', 'Animals/Poodle.png', 'pat'),
      makePet('dog_service', '工作修狗', 'Animals/Service%20Dog.png', 'pat'),
      makePet('wolf', '月下白狼', 'Animals/Wolf.png', 'tsundere'),
      makePet('fox_tail', '大尾小狐', 'Animals/Fox.png', 'look'),
      makePet('raccoon', '干脆小浣', 'Animals/Raccoon.png', 'look'),
      makePet('lion', '霸气狮狮', 'Animals/Lion.png', 'fire'),
      makePet('tiger', '奶凶嗷呜', 'Animals/Tiger%20Face.png', 'bomb'),
      makePet('horse', '奔腾骏马', 'Animals/Horse%20Face.png', 'fire'),
      makePet('unicorn', '闪亮独角', 'Animals/Unicorn.png', 'fire'),
      makePet('zebra', '条纹斑马', 'Animals/Zebra.png', 'look'),
      makePet('deer', '林深见鹿', 'Animals/Deer.png', 'blush'),
      makePet('monkey_see', '非礼勿视', 'Animals/See-No-Evil%20Monkey.png', 'blush'),
      makePet('monkey_hear', '非礼勿听', 'Animals/Hear-No-Evil%20Monkey.png', 'look'),
      makePet('monkey_speak', '非礼勿言', 'Animals/Speak-No-Evil%20Monkey.png', 'look'),
      makePet('pig_nose', '哼唧小猪', 'Animals/Pig%20Nose.png', 'laugh'),
      makePet('boar', '冲锋野猪', 'Animals/Boar.png', 'bomb'),
      makePet('mouse', '机灵灰鼠', 'Animals/Mouse%20Face.png', 'look'),
      makePet('hamster_eat', '狂吃仓鼠', 'Animals/Hamster.png', 'laugh'),
      makePet('hedgehog', '刺猬卷球', 'Animals/Hedgehog.png', 'pleading'),
      makePet('bat', '倒挂蝙蝠', 'Animals/Bat.png', 'goodnight'),
      makePet('seal', '拍肚海豹', 'Animals/Seal.png', 'thumbsup'),
      makePet('whale', '喷水鲸鱼', 'Animals/Spouting%20Whale.png', 'laugh'),
      makePet('dolphin', '跳跃海豚', 'Animals/Dolphin.png', 'fire'),
      makePet('octopus', '软萌章鱼', 'Animals/Octopus.png', 'hug'),
    ],
  },
  {
    id: 'pack_props',
    name: '烟火生活道具包',
    description: '30 款生活日常、饮品道具与趣味陪伴场景',
    itemCount: 30,
    estimatedSize: '5.9 MB',
    stickers: [
      makeProp('coffee', '现磨咖啡', 'Food/Hot%20Beverage.png', 'pat'),
      makeProp('tea_pot', '一壶清茶', 'Food/Teapot.png', 'pat'),
      makeProp('boba', '多加珍珠', 'Food/Bubble%20Tea.png', 'pat'),
      makeProp('ice_cream', '双球冰淇', 'Food/Ice%20Cream.png', 'blush'),
      makeProp('doughnut', '草莓甜甜', 'Food/Doughnut.png', 'blush'),
      makeProp('cookie', '酥脆曲奇', 'Food/Cookie.png', 'pat'),
      makeProp('croissant', '黄油可颂', 'Food/Croissant.png', 'pat'),
      makeProp('burger', '双层汉堡', 'Food/Hamburger.png', 'laugh'),
      makeProp('fries', '香脆薯条', 'Food/French%20Fries.png', 'laugh'),
      makeProp('ramen', '浓汤拉面', 'Food/Steaming%20Bowl.png', 'pat'),
      makeProp('sushi', '三文鱼腩', 'Food/Sushi.png', 'pat'),
      makeProp('dumpling', '皮薄水饺', 'Food/Dumpling.png', 'pat'),
      makeProp('fortune_cookie', '幸运饼干', 'Food/Fortune%20Cookie.png', 'fire'),
      makeProp('popcorn', '电影爆米', 'Food/Popcorn.png', 'look'),
      makeProp('fireworks', '璀璨烟花', 'Activities/Sparkler.png', 'fire'),
      makeProp('balloon', '升空汽球', 'Activities/Balloon.png', 'fire'),
      makeProp('party_popper', '礼炮齐鸣', 'Activities/Party%20Popper.png', 'fire'),
      makeProp('game_die', '运气摇骰', 'Activities/Game%20Die.png', 'thinking'),
      makeProp('joystick', '街机摇杆', 'Activities/Joystick.png', 'fire'),
      makeProp('guitar', '扫弦吉他', 'Objects/Guitar.png', 'fire'),
      makeProp('headphones', '降噪耳机', 'Objects/Headphone.png', 'goodnight'),
      makeProp('camera_flash', '闪光快门', 'Objects/Camera%20with%20Flash.png', 'look'),
      makeProp('hourglass', '沙漏倒计', 'Objects/Hourglass%20Done.png', 'thinking'),
      makeProp('light_bulb', '灵感灯泡', 'Objects/Light%20Bulb.png', 'thinking'),
      makeProp('magic_wand', '施法魔杖', 'Objects/Magic%20Wand.png', 'fire'),
      makeProp('bell', '叮咚提醒', 'Objects/Bell.png', 'look'),
      makeProp('mirror', '梳妆明镜', 'Objects/Mirror.png', 'blush'),
      makeProp('umbrella', '雨天撑伞', 'Objects/Umbrella%20with%20Rain%20Drops.png', 'pleading'),
      makeProp('crystal_ball', '神秘晶球', 'Activities/Crystal%20Ball.png', 'thinking'),
      makeProp('telescope', '深空望远', 'Objects/Telescope.png', 'look'),
    ],
  },
  {
    id: 'pack_gestures',
    name: '肢体互动手势包',
    description: '30 款隔空比心、点赞、鼓掌与手势肢体动作',
    itemCount: 30,
    estimatedSize: '5.6 MB',
    stickers: [
      makeGesture('point_up', '向上指指', 'Hand%20gestures/Backhand%20Index%20Pointing%20Up.png', 'thinking'),
      makeGesture('point_down', '向下瞧瞧', 'Hand%20gestures/Backhand%20Index%20Pointing%20Down.png', 'look'),
      makeGesture('point_left', '向左看看', 'Hand%20gestures/Backhand%20Index%20Pointing%20Left.png', 'look'),
      makeGesture('point_right', '向右看看', 'Hand%20gestures/Backhand%20Index%20Pointing%20Right.png', 'look'),
      makeGesture('index_up', '举手发言', 'Hand%20gestures/Index%20Pointing%20Up.png', 'thumbsup'),
      makeGesture('raised_back', '手背举起', 'Hand%20gestures/Raised%20Back%20of%20Hand.png', 'thumbsup'),
      makeGesture('vulcan', '瓦肯致敬', 'Hand%20gestures/Vulcan%20Salute.png', 'thumbsup'),
      makeGesture('pinched_fingers', '意式手势', 'Hand%20gestures/Pinched%20Fingers.png', 'tsundere'),
      makeGesture('call_me', '电话联系', 'Hand%20gestures/Call%20Me%20Hand.png', 'thumbsup'),
      makeGesture('ok_hand', '稳妥没准', 'Hand%20gestures/OK%20Hand.png', 'thumbsup'),
      makeGesture('crossed_fingers', '真诚许愿', 'Hand%20gestures/Crossed%20Fingers.png', 'pleading'),
      makeGesture('thumbs_down', '表示反对', 'Hand%20gestures/Thumbs%20Down.png', 'tsundere'),
      makeGesture('raised_fist', '加油给劲', 'Hand%20gestures/Raised%20Fist.png', 'fire'),
      makeGesture('left_fist', '出拳过招', 'Hand%20gestures/Left-Facing%20Fist.png', 'thumbsup'),
      makeGesture('right_fist', '正义铁拳', 'Hand%20gestures/Right-Facing%20Fist.png', 'thumbsup'),
      makeGesture('writing', '认真做笔记', 'Hand%20gestures/Writing%20Hand.png', 'thinking'),
      makeGesture('eyes', '两眼放光', 'Smilies/Eyes.png', 'look'),
      makeGesture('brain', '头脑风暴', 'Smilies/Brain.png', 'thinking'),
      makeGesture('bone', '啃啃骨头', 'Smilies/Bone.png', 'pat'),
      makeGesture('tooth', '洁白亮齿', 'Smilies/Tooth.png', 'laugh'),
      makeGesture('sparkles', '闪烁星芒', 'Activities/Sparkles.png', 'fire'),
      makeGesture('collision', '轰炸撞击', 'Smilies/Collision.png', 'bomb'),
      makeGesture('dizzy_star', '头晕金星', 'Smilies/Dizzy.png', 'surprised'),
      makeGesture('sweat_droplets', '狂飙冷汗', 'Smilies/Sweat%20Droplets.png', 'pleading'),
      makeGesture('dash', '脚底抹油', 'Smilies/Dashing%20Away.png', 'tsundere'),
      makeGesture('hole', '原地钻洞', 'Objects/Hole.png', 'blush'),
      makeGesture('bomb_fuse', '点燃引线', 'Smilies/Bomb.png', 'bomb'),
      makeGesture('speech_balloon', '有话要说', 'Smilies/Speech%20Balloon.png', 'thinking'),
      makeGesture('thought_balloon', '浮想联翩', 'Smilies/Thought%20Balloon.png', 'thinking'),
      makeGesture('heart_decoration', '装饰爱心', 'Smilies/Heart%20Decoration.png', 'kiss'),
    ],
  },
];

export interface PackDownloadProgress {
  packId: string;
  total: number;
  completed: number;
  percent: number;
}

export const StickerPackDownloadService = {
  /**
   * 检查指定空间已下载安装的扩展包 ID 集合
   */
  async getInstalledPackIds(space: PixorySpace = 'normal'): Promise<string[]> {
    return runWithDatabaseSpace(space, async (db) => {
      const packs = await customStickerRepository.listStickerPacks(db, space);
      return packs.map((p) => p.id);
    });
  },

  /**
   * 按需下载特定扩展表情包
   */
  async downloadPack(
    packId: string,
    space: PixorySpace = 'normal',
    onProgress?: (progress: PackDownloadProgress) => void
  ): Promise<boolean> {
    const manifest = PRESET_STICKER_PACKS.find((p) => p.id === packId);
    if (!manifest) {
      throw new Error(`未找到 ID 为 ${packId} 的扩展包定义`);
    }

    const packsDir = getStickerPacksDir(space);
    const targetDir = `${packsDir}/${packId}`;
    const dirInfo = await FileSystem.getInfoAsync(targetDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
    }

    const total = manifest.stickers.length;
    let completed = 0;
    const downloadedRecords: {
      id: string;
      space: PixorySpace;
      packId: string;
      name: string;
      uri: string;
      emotionBucket: CoreEmotionBucket;
    }[] = [];

    for (const item of manifest.stickers) {
      const remoteUri = `${FLUENT_BASE}/${item.pathSegment}`;
      const localFilename = `${item.id}.png`;
      const localFileUri = `${targetDir}/${localFilename}`;

      try {
        const fileStat = await FileSystem.getInfoAsync(localFileUri);
        if (!fileStat.exists) {
          const downloadRes = await FileSystem.downloadAsync(remoteUri, localFileUri);
          if (downloadRes.status !== 200) {
            // 若下载失败容错继续，不阻断全包
            continue;
          }
        }

        downloadedRecords.push({
          id: item.id,
          space,
          packId,
          name: item.name,
          uri: localFileUri,
          emotionBucket: item.bucket,
        });
      } catch {
        // 网络波动容错跳过单张
      }

      completed++;
      onProgress?.({
        packId,
        total,
        completed,
        percent: Math.floor((completed / total) * 100),
      });
    }

    if (downloadedRecords.length === 0) {
      throw new Error('下载失败，请检查网络连接后重试');
    }

    // 写入数据库
    await runWithDatabaseSpace(space, async (db) => {
      // 写入或更新包记录
      const now = Date.now();
      await customStickerRepository.insertStickerPack(db, {
        id: packId,
        space,
        name: manifest.name,
        coverUri: downloadedRecords[0]?.uri || null,
        description: manifest.description,
        createdAt: now,
        updatedAt: now,
      });

      // 批量插入表情项
      const stickersToInsert = downloadedRecords.map((r, index) => ({
        id: r.id,
        space: r.space,
        packId: r.packId,
        name: r.name,
        uri: r.uri,
        previewUri: r.uri,
        emotionBucket: r.emotionBucket,
        keywords: [r.name],
        width: 140,
        height: 140,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      }));

      await customStickerRepository.batchInsertCustomStickers(db, stickersToInsert);
    });

    // 动态水合注入 StickerSemanticResolver，AI 实时建立认知并支持双向互发
    const resolvables: ResolvableStickerItem[] = downloadedRecords.map((r) => ({
      id: r.id,
      name: r.name,
      animatedUri: r.uri,
      previewUri: r.uri,
      packId: r.packId,
      width: 140,
      height: 140,
      bucket: r.emotionBucket,
      weight: 1.5,
    }));
    registerCustomStickers(resolvables);

    return true;
  },

  /**
   * 卸载/删除指定扩展包，清理本地磁盘并移除数据库记录与内存索引
   */
  async removePack(packId: string, space: PixorySpace = 'normal'): Promise<boolean> {
    const packsDir = getStickerPacksDir(space);
    const targetDir = `${packsDir}/${packId}`;

    try {
      const dirInfo = await FileSystem.getInfoAsync(targetDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(targetDir, { idempotent: true });
      }
    } catch {}

    // 清理数据库记录（通过领域仓储事务级联删除）
    await runWithDatabaseSpace(space, async (db) => {
      await customStickerRepository.deleteStickerPack(db, packId);
    });

    // 从 AI 语义引擎注销已删除包的表情
    unregisterPackStickers(packId);

    return true;
  },
};
