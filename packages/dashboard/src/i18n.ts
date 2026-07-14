// 界面两套文字(中/英)。讲解内容的语言跟着地图文件走,不在这里。
// 文案与已批准的原型逐字一致;新增的仅有 analyzeStub / openLoaded(M3 的分析入口是占位)。
import type { Lang } from './types';

export interface Strings {
  brand: string;               // 含 <em> 标记,用 dangerouslySetInnerHTML 渲染(仅我们自己的静态文案)
  search: string; tour: string;
  prev: string; next: string; exit: string; intro: string;
  stopOf: (n: number, m: number) => string;
  lane_fe: string; lane_be: string;
  legUp: string; legDn: string;
  scen: string; pain: string; now: string;
  parts: string; layers: string; trades: string;
  ovHint: string;
  impact: string; how: string; broke: string;
  deps: string; needs: string; feeds: string; isStart: string; isEnd: string;
  code: (n: number) => string; codeTitle: string; noCode: string;
  trade: string; chose: string; over: string; cost: string; when: string;
  hl: string; unhl: string; tag: string;
  diffChanged: string; diffAffected: string; legChanged: string; legAffected: string;
  sumHint: string;
  mTitle: string; mLang: string; start: string;
  rejected: string;
}

export const STR: Record<Lang, Strings> = {
  en: {
    brand: 'Understand <em>Everything</em>',
    search: 'Search a part or tool, e.g. Redis', tour: 'Start the tour',
    prev: 'Back', next: 'Next', exit: 'Exit', intro: 'Intro',
    stopOf: (n, m) => `Stop ${n} of ${m}`,
    lane_fe: 'Frontend', lane_be: 'Backend',
    legUp: '<i style="background:var(--up)"></i>What it needs (upstream)',
    legDn: '<i style="background:var(--accent)"></i>What waits on it (downstream)',
    scen: 'Business context', pain: 'The pain before', now: 'What it does now',
    parts: 'parts', layers: 'layers', trades: 'key tradeoffs',
    ovHint: 'Click any part on the canvas, or take the tour in data-flow order. Parts tagged "tradeoff" are where a real choice was made.',
    impact: 'How this design affects you', how: 'How it works', broke: 'When it breaks: ',
    deps: 'Dependencies', needs: 'It needs', feeds: 'Waiting on it',
    isStart: 'nothing · it is the start', isEnd: 'nothing · it is the end',
    code: (n) => `Core code (${n} lines)`, codeTitle: 'Core code', noCode: 'No code here — this part is configured, not written.',
    trade: 'The tradeoff', chose: 'Chose', over: 'over', cost: 'Cost: ', when: 'When to switch: ',
    hl: 'Highlight it in the flow', unhl: 'Clear highlight', tag: 'tradeoff',
    diffChanged: 'changed', diffAffected: 'affected',
    legChanged: '<i style="background:var(--diff-changed)"></i>Changed in the latest regeneration',
    legAffected: '<i style="background:var(--diff-affected)"></i>Downstream of a change',
    sumHint: 'Start with why this project exists — then walk the pipeline.',
    mTitle: 'Understand <em>Everything</em>',
    mLang: 'Language', start: 'Start exploring',
    rejected: 'The loaded app-map.json failed validation, showing the demo instead:',
  },
  zh: {
    brand: '看懂<em>一切</em>',
    search: '搜零件或工具，比如 Redis', tour: '开始导览',
    prev: '上一步', next: '下一步', exit: '退出', intro: '开始',
    stopOf: (n, m) => `管道第 ${n}/${m} 站`,
    lane_fe: '前端', lane_be: '后端',
    legUp: '<i style="background:var(--up)"></i>它需要的（上游）',
    legDn: '<i style="background:var(--accent)"></i>等它输出的（下游）',
    scen: '业务场景', pain: '当时的痛点', now: '现在它做什么',
    parts: '个零件', layers: '层结构', trades: '个关键取舍',
    ovHint: '点击画布上的任意零件，或按数据流顺序走一遍导览。带「取舍」标签的零件，是当初真正做过选择的地方。',
    impact: '这样设计影响你什么', how: '它怎么工作', broke: '出问题时：',
    deps: '依赖关系', needs: '它需要', feeds: '谁在等它',
    isStart: '没有 · 它是起点', isEnd: '没有 · 它是终点',
    code: (n) => `核心代码（${n} 行）`, codeTitle: '核心代码', noCode: '这一块没有代码——它是配置出来的，不是写出来的。',
    trade: '当初的取舍', chose: '选了', over: '没选', cost: '代价：', when: '什么时候该换：',
    hl: '在流程里高亮它的上下游', unhl: '取消高亮', tag: '取舍',
    diffChanged: '变了', diffAffected: '被波及',
    legChanged: '<i style="background:var(--diff-changed)"></i>这次重新生成后变了的',
    legAffected: '<i style="background:var(--diff-affected)"></i>在变化下游、可能被波及的',
    sumHint: '先看这个项目为什么存在——再沿管道走一遍。',
    mTitle: '看懂<em>一切</em>',
    mLang: '语言', start: '开始探索',
    rejected: '检测到的 app-map.json 没通过校验,先展示示例项目。原因:',
  },
};
