import type { DeviceAliasRecord } from '../config/types';
import type { MiHomeDeviceSummary } from './types';

export interface SeededDeviceAliasCandidate {
  deviceId: string;
  model: string;
  originalName: string;
  alias: string;
  note: string;
}

export const SEEDED_DEVICE_ALIAS_CANDIDATES: SeededDeviceAliasCandidate[] = [
  {
    deviceId: '828467621',
    model: 'xiaomi.fryer.maf16',
    originalName: 'Mijia Smart Air Fryer P1 6.5L',
    alias: '智能空气炸锅 P1 6.5L',
    note: '根据 2026-03-29 米家首页截图匹配。',
  },
  {
    deviceId: '1159588850',
    model: 'giot.curtain.v5icm',
    originalName: 'V1 Lithium battery smart curtain (Mesh)',
    alias: 'V1锂电池智能窗帘（Mesh）',
    note: '根据长期离线设备截图匹配。',
  },
  {
    deviceId: '860380109',
    model: 'chunmi.health_pot.cmpa1',
    originalName: 'Mi Smart Multi-functional Kettle',
    alias: '智能多功能养生壶',
    note: '根据厨房设备截图匹配。',
  },
  {
    deviceId: '2146989842',
    model: 'xiaomi.health_pot.p1v2',
    originalName: 'Mijia Smart Multifunctional Kettle P1',
    alias: '智能多功能养生壶 P1',
    note: '根据首页设备截图匹配。',
  },
  {
    deviceId: '686152235',
    model: 'xiaomi.kettle.mek01',
    originalName: 'Mijia Smart Electric Hot Water Dispenser 5L',
    alias: '智能电热水瓶 5L',
    note: '根据长期离线设备截图匹配。',
  },
  {
    deviceId: '656219680',
    model: 'chuangmi.camera.029a02',
    originalName: 'Mi 360° Home Security Camera 2K',
    alias: '智能摄像机 云台版 2K',
    note: '根据长期离线设备截图匹配。',
  },
  {
    deviceId: 'blt.3.1hvqlmsi8kg00',
    model: 'xiaomi.pet_waterer.002',
    originalName: 'Mijia Wireless Smart Pet Fountain',
    alias: '无线智能宠物饮水机',
    note: '根据首页设备截图匹配。',
  },
  {
    deviceId: 'blt.3.1o6vs2i410k00',
    model: 'szxzh.humidifier.js01p',
    originalName: 'KeBinSi Smart Humidifier JS01P',
    alias: 'KeBinSi 智能加湿器 JS01P',
    note: '根据花卉房间截图匹配。',
  },
  {
    deviceId: 'blt.3.1f1q4ibqoeg00',
    model: 'soocare.toothbrush.t501',
    originalName: 'Mi Smart Electric Toothbrush T501',
    alias: '声波电动牙刷 T501',
    note: '根据首页设备截图匹配。',
  },
  {
    deviceId: '620701730',
    model: 'zhimi.airp.rma2',
    originalName: 'Xiaomi Smart Air Purifier  4 Lite',
    alias: '空气净化器 4 Lite',
    note: '根据环境页截图匹配。',
  },
  {
    deviceId: '656941281',
    model: 'xwhzp.diffuser.xwxfj',
    originalName: 'Mijia Smart Scent Diffuser',
    alias: '智能调香机',
    note: '根据首页设备截图匹配。',
  },
  {
    deviceId: '918317440',
    model: 'xiaomi.dishwasher.ts10',
    originalName: 'Mijia Smart Tabletop Dishwasher S10',
    alias: '智能台式洗碗机 6套 S10',
    note: '根据首页设备截图匹配。',
  },
  {
    deviceId: '862092570',
    model: 'chunmi.cooker.cmwy3',
    originalName: 'Xiaomi Smart IH Rice Cooker 3L',
    alias: '智能微压 IH 电饭煲 3L',
    note: '根据厨房设备截图匹配。',
  },
  {
    deviceId: '752558484',
    model: 'chunmi.ysj.tsa1p',
    originalName: 'Mijia Smart Filtered Water Dispenser Pro',
    alias: '米家净饮机',
    note: '根据用户补充口径匹配。',
  },
  {
    deviceId: 'blt.3.1nq5rb0c8c002',
    model: 'xiaomi.scales.ms116',
    originalName: 'Mijia 8-Electrode Body Composition Scale S800',
    alias: '八电极体脂秤 S800',
    note: '根据首页设备截图匹配。',
  },
  {
    deviceId: '833503912',
    model: 'hfjh.fishbowl.m100',
    originalName: 'Mijia Smart Fish Tank 2',
    alias: '智能鱼缸 2',
    note: '根据首页设备截图匹配。',
  },
  {
    deviceId: 'miwifi.82b1de51-3f8c-e579-7a1d-9f1a71a49651',
    model: 'xiaomi.router.r4a',
    originalName: 'Xiaomi_5E8B',
    alias: '路由器',
    note: '根据用户补充口径匹配。',
  },
];

export function applyDeviceNamePreference(
  device: MiHomeDeviceSummary,
  aliasRecord?: DeviceAliasRecord,
): MiHomeDeviceSummary {
  const originalName = device.originalName || device.name;
  const shouldUseAlias =
    aliasRecord &&
    aliasRecord.alias.trim().length > 0 &&
    (!aliasRecord.applyWhenOriginalName || aliasRecord.applyWhenOriginalName === originalName);

  return {
    ...device,
    originalName,
    name: shouldUseAlias ? aliasRecord.alias : originalName,
    nameSource: shouldUseAlias ? 'alias' : 'cloud',
    ...(aliasRecord?.alias ? { aliasName: aliasRecord.alias } : {}),
  };
}
