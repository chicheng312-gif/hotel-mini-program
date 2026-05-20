/** 精简小程序全局类型占位，避免引入完整 miniprogram-api-typings 依赖 */
interface IAppOption {
  globalData?: Record<string, unknown>;
  onLaunch?(options?: WechatMiniprogram.App.LaunchShowOption): void;
}

declare namespace WechatMiniprogram {
  namespace App {
    interface LaunchShowOption {
      path?: string;
      query?: Record<string, string>;
    }
  }
}

declare const App: (opt: IAppOption) => void;
declare const Page: (opt: Record<string, unknown>) => void;
declare const Component: (opt: Record<string, unknown>) => void;
declare const getApp: <T = IAppOption>() => T;

interface Wx {
  getSystemInfoSync: () => { theme?: string; [key: string]: unknown };
  onThemeChange?: (cb: (r: { theme: string }) => void) => void;
  cloud: {
    init: (opt: Record<string, unknown>) => void;
    callFunction: (opt: {
      name: string;
      data?: Record<string, unknown>;
    }) => Promise<{ result: unknown }>;
  };
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, data: unknown) => void;
  removeStorageSync: (key: string) => void;
  clearStorageSync: () => void;
  getUserProfile: (opt: {
    desc: string;
    success?: (res: { userInfo: { nickName: string; avatarUrl: string } }) => void;
    fail?: (e: unknown) => void;
  }) => void;
  showToast: (opt: { title: string; icon?: "success" | "error" | "none" }) => void;
  showModal: (opt: {
    title: string;
    content: string;
    showCancel?: boolean;
    success?: (r: { confirm: boolean }) => void;
  }) => void;
  navigateTo: (opt: { url: string }) => void;
  switchTab: (opt: { url: string }) => void;
  reLaunch: (opt: { url: string }) => void;
  setNavigationBarTitle: (opt: { title: string }) => void;
  stopPullDownRefresh: () => void;
  onThemeChange?: (cb: (r: { theme: string }) => void) => void;
}

declare const wx: Wx;
