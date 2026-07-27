/**
 * 词典查询 — 选中文字后的免费解释层。
 * 匹配顺序:当前节点词典 → 全局词典;比对前把词形归一
 * (小写、去首尾标点引号、空格折叠),中英词条同样处理。
 * 查不到返回 null,由上层决定走实时解释还是"复制成问题"兜底。
 */

// 归一:小写、去首尾的标点/引号/括号、把连续空白折成一个空格
export function normalizeTerm(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’「」『』《》()()【】\[\]{}.,;:!?、,。;:!?·—-]+/g, '')
    .replace(/[\s"'“”‘’「」『』《》()()【】\[\]{}.,;:!?、,。;:!?·—-]+$/g, '');
}

function findIn(glossary, key) {
  if (!glossary) return null;
  for (const [term, entry] of Object.entries(glossary)) {
    if (normalizeTerm(term) === key) return entry;
  }
  return null;
}

/**
 * lookupGlossary(map, nodeId, rawSelection) → 词条对象或 null
 */
export function lookupGlossary(map, nodeId, rawSelection) {
  const key = normalizeTerm(rawSelection);
  if (!key) return null;
  return (
    findIn(map?.nodes?.[nodeId]?.glossary, key) ??
    findIn(map?.glossary, key) ??
    null
  );
}
