// 开场弹窗:选语言、可填 GitHub 仓库(分析在 AI 工具里做,这里是指引)、进入项目。
// 若检测到本地生成的 app-map.json(合格),主按钮变为「打开已加载的项目」。
import { useState } from 'react';
import { useStore } from '../store';
import { STR } from '../i18n';

export function OnboardingModal() {
  const { lang, modalOpen, external, setLang, openMap } = useStore();
  const [status, setStatus] = useState('');
  if (!modalOpen) return null;
  const s = STR[lang];

  return (
    <div className="modal-bg">
      <div className="modal">
        <h1 dangerouslySetInnerHTML={{ __html: s.mTitle }} />
        <p className="sub">{s.mSub}</p>
        <div className="m-label">{s.mLang}</div>
        <div className="m-langs">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中文</button>
        </div>
        <div className="m-label">{s.mRepo}</div>
        <input id="repoUrl" type="text" placeholder="https://github.com/owner/repo" />
        <p className="m-note">{s.mNote}</p>
        <div className="m-actions">
          {external ? (
            <button id="btnAnalyze" onClick={() => openMap('external')}>{s.openLoaded}</button>
          ) : (
            <button id="btnAnalyze" onClick={() => setStatus(s.analyzeStub)}>{s.analyze}</button>
          )}
          <button id="btnDemo" onClick={() => openMap('demo')}>{s.demo}</button>
        </div>
        <p className="m-status">{status}</p>
      </div>
    </div>
  );
}
