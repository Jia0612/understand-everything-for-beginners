// 右侧面板:未选中时显示项目总览;选中零件时按固定分工展示。
// 附带选词解释:在面板里选中一个词 → 浮出「解释」按钮 → 查本地词典 → 弹解释卡。
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { STR } from '../i18n';
import { L } from '../lib/bilingual.mjs';
import { lookupGlossary } from '../lib/glossary.mjs';
import type { GlossaryEntry, MapNode } from '../types';

function Overview() {
  const { lang, data, source, rejectedBecause } = useStore();
  const s = STR[lang];
  const chain = data.chain;
  const trades = chain.filter((id) => data.nodes[id].tradeoff).length;
  const lanes = new Set(chain.map((id) => data.nodes[id].lane));
  const sec = (title: string, body: string) =>
    body ? (
      <div className="sec">
        <div className="sec-title">{title}</div>
        <p className="how">{body}</p>
      </div>
    ) : null;

  return (
    <>
      <h2 className="pname">{L(data.project.name, lang)}</h2>
      {sec(s.scen, L(data.project.scenario, lang))}
      {sec(s.pain, L(data.project.pain, lang))}
      {sec(s.now, L(data.project.now, lang))}
      <div className="ov-stats">
        <div className="stat"><div className="n">{chain.length}</div><div className="l">{s.parts}</div></div>
        <div className="stat"><div className="n">{lanes.size}</div><div className="l">{s.layers}</div></div>
        <div className="stat"><div className="n">{trades}</div><div className="l">{s.trades}</div></div>
      </div>
      <p className="ov-hint">{s.ovHint}</p>
      {source === 'demo' && rejectedBecause.length > 0 && (
        <p className="ov-hint" style={{ color: 'var(--warn)' }}>
          {s.rejected} {rejectedBecause.slice(0, 3).join('; ')}
        </p>
      )}
    </>
  );
}

function NodeDetail({ id, node }: { id: string; node: MapNode }) {
  const { lang, data, selectNode } = useStore();
  const s = STR[lang];
  const [codeOpen, setCodeOpen] = useState(false);
  const station = data.chain.indexOf(id) + 1;
  const fail = L(node.fail, lang);

  const chips = (ids: string[], emptyText: string) => {
    const real = (ids || []).filter((i) => data.nodes[i]);
    if (!real.length) return <span className="chip none">{emptyText}</span>;
    return real.map((i) => (
      <button key={i} className="chip" onClick={() => selectNode(i)}>
        {L(data.nodes[i].name, lang)}
      </button>
    ));
  };

  const codeLines = (node.code || []).reduce(
    (a, b) => a + String(b.c || '').split('\n').length, 0);

  return (
    <>
      <h2 className="pname">{L(node.name, lang)}</h2>
      <div className="badges">
        <span className="badge tool">{node.tool}</span>
        <span className="badge">{node.lane === 'db' ? 'Database' : s[`lane_${node.lane}`]}</span>
        <span className="badge">{s.stopOf(station, data.chain.length)}</span>
      </div>
      <p className="role">{L(node.role, lang)}</p>

      {/* v2:这一站里装着什么(实际组成清单) */}
      {node.contents?.length ? (
        <div className="sec">
          <div className="sec-title">{s.contentsTitle}</div>
          <ul className="impact">
            {node.contents.map((it, i) => <li key={i}>{L(it, lang)}</li>)}
          </ul>
        </div>
      ) : null}

      {/* v2:前后对比 */}
      {(node.before?.length || node.after?.length) ? (
        <div className="sec">
          <div className="sec-title">{s.beforeAfter}</div>
          {node.before?.length ? (
            <div className="ba-row">
              <span className="ba-label before">{s.beforeLabel}</span>
              <ul className="ba-list">{node.before.map((it, i) => <li key={i}>{L(it, lang)}</li>)}</ul>
            </div>
          ) : null}
          {node.after?.length ? (
            <div className="ba-row">
              <span className="ba-label after">{s.afterLabel}</span>
              <ul className="ba-list">{node.after.map((it, i) => <li key={i}>{L(it, lang)}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* v1 = 宽泛影响;v2 = 只讲你承担的成本与风险 */}
      {node.impact?.length > 0 && (
        <div className="sec">
          <div className="sec-title">{data.version === 2 ? s.costRisk : s.impact}</div>
          <ul className="impact">
            {node.impact.map((it, i) => <li key={i}>{L(it, lang)}</li>)}
          </ul>
        </div>
      )}

      <div className="sec">
        <div className="sec-title">{s.how}</div>
        <p className="how">{L(node.how, lang)}</p>
        {fail && <p className="fail"><b>{s.broke}</b>{fail}</p>}
      </div>

      <div className="sec">
        <div className="sec-title">{s.deps}</div>
        <div className="dep-row"><span className="dep-key">{s.needs}</span><span className="chips">{chips(node.needs, s.isStart)}</span></div>
        <div className="dep-row"><span className="dep-key">{s.feeds}</span><span className="chips">{chips(node.feeds, s.isEnd)}</span></div>
      </div>

      {node.code?.length ? (
        <div className={`sec ${codeOpen ? 'code-open' : ''}`}>
          <button className="code-toggle" onClick={() => setCodeOpen(!codeOpen)}>
            <span>{s.evidence(codeLines)}</span><span className="arrow">›</span>
          </button>
          <div className="code-body">
            {node.code.map((b, i) => (
              <div className="cblock" key={i}>
                {(b.title || b.src) && (
                  <div className="ev-head">
                    {b.title ? <span className="ev-title">{L(b.title, lang)}</span> : null}
                    {b.src ? <span className="ev-src">{b.src}</span> : null}
                  </div>
                )}
                {b.lines?.length ? (
                  // 逐行费曼翻译:一行代码、一行人话,交替排
                  <div className="code-lines">
                    {b.c.split('\n').map((codeLine, j) => (
                      <div className="code-line" key={j}>
                        <pre>{codeLine || ' '}</pre>
                        {b.lines![j] ? <div className="line-note">{L(b.lines![j], lang)}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre>{b.c}</pre>
                )}
                <div className="note">{L(b.n, lang)}</div>
                {b.risk ? <div className="risk">{L(b.risk, lang)}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="sec">
          <div className="sec-title">{s.codeTitle}</div>
          <p className="no-code">{s.noCode}</p>
        </div>
      )}

      {node.tradeoff && (
        <div className="sec">
          <div className="sec-title">{s.trade}</div>
          <div className="tradeoff">
            <p>
              {s.chose} <b>{L(node.tradeoff.a, lang)}</b>{lang === 'zh' ? '，' : ', '}
              {s.over} <b>{L(node.tradeoff.b, lang)}</b>{lang === 'zh' ? '。' : '.'}
            </p>
            <p><b>{s.cost}</b>{L(node.tradeoff.cost, lang)}</p>
            <p><b>{s.when}</b>{L(node.tradeoff.when, lang)}</p>
          </div>
        </div>
      )}
    </>
  );
}

export function NodeInfo() {
  const { lang, data, selected, hlActive, toggleHl } = useStore();
  const s = STR[lang];
  const ref = useRef<HTMLDivElement>(null);

  // 选词解释的三个状态:浮动按钮的位置、解释卡内容、"已复制"提示
  const [pick, setPick] = useState<{ text: string; x: number; y: number } | null>(null);
  const [card, setCard] = useState<{ term: string; entry: GlossaryEntry | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; setPick(null); setCard(null); }, [selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPick(null); setCard(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 只在说明面板里响应选中;太长(>100 字)或空选择不弹按钮
  const onMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || text.length > 100 || !sel || sel.rangeCount === 0 || !ref.current) { setPick(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const panel = ref.current.getBoundingClientRect();
    setPick({
      text,
      x: Math.max(4, rect.left - panel.left),
      y: rect.bottom - panel.top + ref.current.scrollTop + 6,
    });
  };

  const explain = () => {
    if (!pick) return;
    setCard({ term: pick.text, entry: lookupGlossary(data, selected ?? '', pick.text) });
    setPick(null);
    setCopied(false);
  };

  const copyQuestion = async () => {
    if (!card) return;
    const nodeName = selected ? L(data.nodes[selected].name, lang) : '';
    const q = lang === 'zh'
      ? `在「${nodeName}」这个部分里,"${card.term}" 是什么意思?请用大白话解释给完全不懂技术的人。`
      : `In the part "${nodeName}", what does "${card.term}" mean? Please explain in plain language for a non-technical person.`;
    try { await navigator.clipboard.writeText(q); setCopied(true); } catch { /* 剪贴板被拒就算了 */ }
  };

  const node = selected ? data.nodes[selected] : null;
  return (
    <>
      <div className="panel-scroll" ref={ref} onMouseUp={onMouseUp} onScroll={() => setPick(null)}>
        {node && selected ? <NodeDetail key={selected} id={selected} node={node} /> : <Overview />}
        {pick && (
          <button className="explain-btn" style={{ left: pick.x, top: pick.y }} onClick={explain}>
            {s.explain}
          </button>
        )}
      </div>
      {card && (
        <div className="explain-card">
          <div className="ec-head">
            <span className="sec-title">{s.glossTitle}</span>
            <button className="ec-close" onClick={() => setCard(null)}>×</button>
          </div>
          <p className="ec-term">{card.term}</p>
          {card.entry ? (
            <>
              <p className="ec-body">{L(card.entry.short, lang)}</p>
              {card.entry.detail ? <p className="ec-body dim">{L(card.entry.detail, lang)}</p> : null}
              {card.entry.example ? <p className="ec-body dim"><b>{s.glossExample}:</b>{L(card.entry.example, lang)}</p> : null}
            </>
          ) : (
            <>
              <p className="ec-body dim">{s.glossMiss}</p>
              <button className="btn-hl" onClick={copyQuestion}>{copied ? s.copied : s.copyQ}</button>
            </>
          )}
        </div>
      )}
      {node && (
        <div className="panel-foot">
          <button className={`btn-hl ${hlActive ? 'active' : ''}`} onClick={toggleHl}>
            {hlActive ? s.unhl : s.hl}
          </button>
        </div>
      )}
    </>
  );
}
