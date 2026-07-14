// 组装:顶栏 + 全幅画布 + 350px 右面板(UI 三件套,永不加第四个区域)+ 开场弹窗。
// 启动时尝试加载 ./app-map.json:过校验就作为「已加载的项目」,否则退回示例并说明原因。
import { useEffect } from 'react';
import { useStore } from './store';
import { chooseData } from './lib/chooseData.mjs';
import { Header } from './components/Header';
import { GraphView } from './components/GraphView';
import { NodeInfo } from './components/NodeInfo';
import { TourBar } from './components/TourBar';
import { OnboardingModal } from './components/OnboardingModal';

export default function App() {
  const { intro, setExternal, escape } = useStore();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('./app-map.json');
        if (!res.ok) return;
        const json = await res.json();
        const picked = chooseData(json, null);
        if (picked.source === 'external') setExternal(picked.data, []);
        else setExternal(null, picked.rejectedBecause);
      } catch { /* 没有外部地图文件——正常,用示例 */ }
    })();
  }, [setExternal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') escape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [escape]);

  return (
    <div className={`app ${intro ? 'intro' : ''}`} style={{ height: '100%' }}>
      <OnboardingModal />
      <Header />
      <div className="main">
        <GraphView />
        <aside>
          <TourBar />
          <NodeInfo />
        </aside>
      </div>
    </div>
  );
}
