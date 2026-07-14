// 开场弹窗(2026-07-13 用户拍板瘦身版):只剩标题、语言选择、一个开始按钮。
// 检测到本地生成的地图就打开它,否则打开示例项目。
import { useStore } from '../store';
import { STR } from '../i18n';

export function OnboardingModal() {
  const { lang, modalOpen, external, setLang, openMap } = useStore();
  if (!modalOpen) return null;
  const s = STR[lang];

  return (
    <div className="modal-bg">
      <div className="modal">
        <h1 dangerouslySetInnerHTML={{ __html: s.mTitle }} />
        <div className="m-label">{s.mLang}</div>
        <div className="m-langs">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中文</button>
        </div>
        <div className="m-actions">
          <button id="btnStart" onClick={() => openMap(external ? 'external' : 'demo')}>{s.start}</button>
        </div>
      </div>
    </div>
  );
}
