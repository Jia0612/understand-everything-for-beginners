// 组装:顶栏 + 全幅画布 + 350px 右面板(UI 三件套,永不加第四个区域)+ 开场弹窗。
// 启动时尝试加载 ./app-map.json:过校验就作为「已加载的项目」,否则退回示例并说明原因。
import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { chooseData } from './lib/chooseData.mjs';
import { Header } from './components/Header';
import { GraphView } from './components/GraphView';
import { NodeInfo } from './components/NodeInfo';
import { TourBar } from './components/TourBar';
import { OnboardingModal } from './components/OnboardingModal';

export default function App() {
  const { intro, setExternal, escape } = useStore();

  // 右侧面板宽度可拖(280–640px);抓住把手横向拖动即可
  const [panelW, setPanelW] = useState(350);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(false);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setPanelW(Math.min(640, Math.max(280, window.innerWidth - e.clientX)));
    };
    const onUp = () => { dragRef.current = false; setDragging(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

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

  // 主题试穿:网址加 ?theme=paper 或 ?theme=ink 即可切换整套配色字体(定稿后改为默认值)
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('theme');
    if (t === 'paper' || t === 'ink') document.documentElement.dataset.theme = t;
  }, []);

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
        <div
          className={`panel-resizer ${dragging ? 'dragging' : ''}`}
          onPointerDown={() => { dragRef.current = true; setDragging(true); }}
        />
        <aside style={{ width: panelW }}>
          <TourBar />
          <NodeInfo />
        </aside>
      </div>
    </div>
  );
}
