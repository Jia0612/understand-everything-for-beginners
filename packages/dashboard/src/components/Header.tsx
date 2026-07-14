// 顶栏:品牌 · 项目名 · 搜索 · EN/中文 · 导览按钮(UI 三件套之一,不许加第四个区域)
import { useStore } from '../store';
import { STR } from '../i18n';
import { L } from '../lib/bilingual.mjs';

export function Header() {
  const { lang, data, search, setSearch, setLang, startTour } = useStore();
  const s = STR[lang];
  return (
    <header>
      <div className="brand" dangerouslySetInnerHTML={{ __html: s.brand }} />
      <div className="vdiv" />
      <div className="proj">{L(data.project.name, lang)}</div>
      <input
        id="search"
        type="text"
        placeholder={s.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="langpill">
        <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中文</button>
      </div>
      <button className="btn-tour" onClick={startTour}>{s.tour}</button>
    </header>
  );
}
