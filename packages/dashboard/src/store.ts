// 状态中心:当前语言、展示哪份地图、选中的零件、高亮、导览进度、开场状态。
// 行为语义与原型页面一致(导览第 0 站 = 项目总览,之后按数据流逐站)。
import { create } from 'zustand';
import type { AppMap, Lang } from './types';
import demoJson from '../../../docs/app-map.example.json';

const demo = demoJson as unknown as AppMap;

interface State {
  lang: Lang;
  data: AppMap;
  source: 'demo' | 'external';
  external: AppMap | null;
  rejectedBecause: string[];
  modalOpen: boolean;
  intro: boolean;            // 开场:画布压暗,只亮导览按钮
  selected: string | null;
  hlActive: boolean;
  tourOn: boolean;
  tourIdx: number;
  search: string;

  setLang: (l: Lang) => void;
  setExternal: (data: AppMap | null, rejectedBecause: string[]) => void;
  openMap: (which: 'demo' | 'external') => void;
  wake: () => void;
  selectNode: (id: string) => void;
  toggleHl: () => void;
  setSearch: (q: string) => void;
  startTour: () => void;
  tourGo: (i: number) => void;
  tourNext: () => void;
  tourPrev: () => void;
  exitTour: () => void;
  escape: () => void;
}

export const useStore = create<State>((set, get) => ({
  lang: 'en',
  data: demo,
  source: 'demo',
  external: null,
  rejectedBecause: [],
  modalOpen: true,
  intro: false,
  selected: null,
  hlActive: false,
  tourOn: false,
  tourIdx: 0,
  search: '',

  setLang: (lang) => set({ lang }),
  setExternal: (external, rejectedBecause) => set({ external, rejectedBecause }),

  openMap: (which) => set((s) => ({
    data: which === 'external' && s.external ? s.external : demo,
    source: which === 'external' && s.external ? 'external' : 'demo',
    modalOpen: false,
    intro: true,
    selected: null,
    hlActive: false,
    tourOn: false,
    tourIdx: 0,
    search: '',
  })),

  wake: () => set({ intro: false }),
  selectNode: (id) => set({ selected: id, intro: false }),
  toggleHl: () => set((s) => ({ hlActive: !s.hlActive })),
  setSearch: (search) => set({ search, intro: false }),

  startTour: () => set({ tourOn: true, tourIdx: 0, selected: null, hlActive: false }),
  tourGo: (i) => {
    const { data } = get();
    if (i < 0 || i > data.chain.length) return;
    if (i === 0) {
      // 第 0 站 = 项目总览:清掉选中和高亮
      set({ tourIdx: 0, selected: null, hlActive: false });
    } else {
      set({ tourIdx: i, selected: data.chain[i - 1], hlActive: true, intro: false });
    }
  },
  // 用 get() 取当前站数:快速连点也一步一站,不会吞掉点击
  tourNext: () => get().tourGo(get().tourIdx + 1),
  tourPrev: () => get().tourGo(get().tourIdx - 1),
  exitTour: () => set({ tourOn: false, hlActive: false, intro: false }),
  escape: () => set({ tourOn: false, hlActive: false }),
}));
