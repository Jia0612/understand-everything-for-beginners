/**
 * chooseData(external, demo) — 决定仪表盘展示哪份地图。
 * 外部文件(.ue/app-map.json 或 public/app-map.json)先过 M2 规范包的校验:
 * 合格就用它;不合格或不存在就退回示例项目,并把拒收原因留给界面展示。
 * 坏数据永远到不了画布。
 */
import { validateAppMap } from '@understand-everything/core';

export function chooseData(external, demo) {
  if (external == null) {
    return { data: demo, source: 'demo', rejectedBecause: [] };
  }
  const { valid, errors } = validateAppMap(external);
  if (valid) {
    return { data: external, source: 'external', rejectedBecause: [] };
  }
  return { data: demo, source: 'demo', rejectedBecause: errors };
}
