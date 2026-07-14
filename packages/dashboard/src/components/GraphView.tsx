// 画布:三条泳道 + 零件卡片 + 带箭头的连线。位置全部由排版公式算出,没有物理模拟。
import { useStore } from '../store';
import { STR } from '../i18n';
import { L } from '../lib/bilingual.mjs';
import { nodePos, edgePath, canvasWidth } from '../lib/layout.mjs';

export function GraphView() {
  const { lang, data, selected, hlActive, search, selectNode } = useStore();
  const s = STR[lang];
  const chain = data.chain;
  const width = canvasWidth(chain.length);
  const selIdx = selected ? chain.indexOf(selected) : -1;
  const q = search.trim().toLowerCase();

  const diffChanged = new Set(data.diff?.changed ?? []);
  const diffAffected = new Set(data.diff?.affected ?? []);

  const nodeClass = (id: string, i: number) => {
    const n = data.nodes[id];
    const cls = ['node'];
    if (diffChanged.has(id)) cls.push('diff-changed');
    else if (diffAffected.has(id)) cls.push('diff-affected');
    if (id === selected) cls.push('selected');
    if (hlActive && selIdx >= 0) {
      if (i < selIdx) cls.push('up-hl');
      else if (i > selIdx) cls.push('down-hl');
    }
    if (q) {
      const hit =
        L(n.name, lang).toLowerCase().includes(q) ||
        String(n.tool || '').toLowerCase().includes(q);
      if (!hit) cls.push('dim');
    }
    return cls.join(' ');
  };

  const edgeClass = (i: number) => {
    const cls = ['edge'];
    if (hlActive && selIdx >= 0) cls.push(i < selIdx ? 'up' : 'down');
    return cls.join(' ');
  };

  return (
    <div className="canvas-wrap">
      <div className="canvas" style={{ minWidth: width }}>
        <div className="lane" id="lane-fe"><span className="lane-label" style={{ color: 'var(--lane-fe)' }}>{s.lane_fe}</span></div>
        <div className="lane" id="lane-be"><span className="lane-label" style={{ color: 'var(--lane-be)' }}>{s.lane_be}</span></div>
        <div className="lane" id="lane-db"><span className="lane-label" style={{ color: 'var(--lane-db)' }}>Database</span></div>

        <svg className="edges" style={{ width }}>
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--edge-arrow)' }} />
            </marker>
          </defs>
          <g>
            {chain.slice(0, -1).map((id, i) => (
              <path
                key={id}
                className={edgeClass(i)}
                d={edgePath(nodePos(data, id), nodePos(data, chain[i + 1]))}
                markerEnd="url(#arr)"
              />
            ))}
          </g>
        </svg>

        {chain.map((id, i) => {
          const n = data.nodes[id];
          const p = nodePos(data, id);
          return (
            <button
              key={id}
              className={nodeClass(id, i)}
              style={{ left: p.x, top: p.y }}
              onClick={() => selectNode(id)}
            >
              <div className="node-head">
                <span className="dot" style={{ background: `var(--lane-${n.lane})` }} />
                <span className="node-name">{L(n.name, lang)}</span>
                {diffChanged.has(id) ? <span className="diff-tag changed">{s.diffChanged}</span>
                  : diffAffected.has(id) ? <span className="diff-tag affected">{s.diffAffected}</span>
                  : n.tradeoff ? <span className="tag-tradeoff">{s.tag}</span> : null}
              </div>
              <span className="node-tool">{n.tool}</span>
            </button>
          );
        })}

        <div className={`legend ${hlActive || diffChanged.size ? 'on' : ''}`}>
          {hlActive && <span dangerouslySetInnerHTML={{ __html: s.legUp }} />}
          {hlActive && <span dangerouslySetInnerHTML={{ __html: s.legDn }} />}
          {diffChanged.size > 0 && <span dangerouslySetInnerHTML={{ __html: s.legChanged }} />}
          {diffChanged.size > 0 && <span dangerouslySetInnerHTML={{ __html: s.legAffected }} />}
        </div>
      </div>
    </div>
  );
}
