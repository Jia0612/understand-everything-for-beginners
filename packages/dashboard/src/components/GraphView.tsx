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

  const nodeClass = (id: string, i: number) => {
    const n = data.nodes[id];
    const cls = ['node'];
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
              <path d="M0,0 L8,4 L0,8 z" fill="rgba(212,165,116,.5)" />
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
                {n.tradeoff ? <span className="tag-tradeoff">{s.tag}</span> : null}
              </div>
              <span className="node-tool">{n.tool}</span>
            </button>
          );
        })}

        <div className={`legend ${hlActive ? 'on' : ''}`}>
          <span dangerouslySetInnerHTML={{ __html: s.legUp }} />
          <span dangerouslySetInnerHTML={{ __html: s.legDn }} />
        </div>
      </div>
    </div>
  );
}
