// 右侧面板:未选中时显示项目总览;选中零件时按固定六节展示(六节封顶,顺序不许变)。
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { STR } from '../i18n';
import { L } from '../lib/bilingual.mjs';
import type { MapNode } from '../types';

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

      {node.impact?.length > 0 && (
        <div className="sec">
          <div className="sec-title">{s.impact}</div>
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
            <span>{s.code(codeLines)}</span><span className="arrow">›</span>
          </button>
          <div className="code-body">
            {node.code.map((b, i) => (
              <div className="cblock" key={i}>
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

  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [selected]);

  const node = selected ? data.nodes[selected] : null;
  return (
    <>
      <div className="panel-scroll" ref={ref}>
        {node && selected ? <NodeDetail key={selected} id={selected} node={node} /> : <Overview />}
      </div>
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
