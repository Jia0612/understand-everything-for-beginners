// 导览条:第 0 站是项目总览,之后沿数据流一站一站走,Next 常亮呼吸提示。
import { useStore } from '../store';
import { STR } from '../i18n';
import { L } from '../lib/bilingual.mjs';

export function TourBar() {
  const { lang, data, tourOn, tourIdx, tourNext, tourPrev, exitTour } = useStore();
  if (!tourOn) return null;
  const s = STR[lang];
  const total = data.chain.length;
  const hint = tourIdx === 0
    ? s.sumHint
    : L(data.nodes[data.chain[tourIdx - 1]]?.tourHint, lang);

  return (
    <div className="tourbar on">
      <span className="step">{tourIdx === 0 ? s.intro : `${tourIdx}/${total}`}</span>
      <span className="hint">{hint}</span>
      <button disabled={tourIdx === 0} onClick={tourPrev}>{s.prev}</button>
      <button id="tourNext" disabled={tourIdx === total} onClick={tourNext}>{s.next}</button>
      <button onClick={exitTour}>{s.exit}</button>
    </div>
  );
}
