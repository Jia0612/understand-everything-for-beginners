/**
 * 排版公式 — 规则排版,不用物理模拟:
 * 零件的横坐标 = 它在数据流里的次序 × 固定间距;纵坐标 = 它所在泳道的中线。
 * 数值与原型页面完全一致(BUILD-SPEC §5)。
 */

export const NODE_W = 180;          // 零件卡片宽度
export const SPACING = 210;         // 相邻零件的横向间距
export const X_START = 50;          // 第一个零件的起点
export const LANE_Y = { fe: 60, be: 255, db: 440 };  // 三条泳道的纵坐标

/** 一个零件的画布位置。data 只需有 chain 和 nodes。 */
export function nodePos(data, id) {
  const i = data.chain.indexOf(id);
  const lane = data.nodes[id]?.lane;
  return { x: X_START + i * SPACING, y: LANE_Y[lane] ?? LANE_Y.be };
}

/** 两个零件之间的连线:同泳道直线,跨泳道三次贝塞尔弧线。 */
export function edgePath(a, b) {
  const sx = a.x + NODE_W, sy = a.y + 33, tx = b.x, ty = b.y + 33;
  if (sy === ty) return `M${sx},${sy} L${tx},${ty}`;
  const mx = (sx + tx) / 2;
  return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
}

/** 画布最小宽度:装得下整条链再留边。 */
export function canvasWidth(chainLength) {
  return X_START + chainLength * SPACING + 40;
}
