/**
 * L(value, lang) — 取一句内容的当前语言版本。
 * 双语对 {en,zh} 按 lang 取,缺的语言退回另一种;普通字符串原样返回;空值返回 ""。
 * 和原型页面里的 L() 行为完全一致。
 */
export function L(v, lang) {
  if (v == null) return '';
  if (typeof v === 'object' && ('en' in v || 'zh' in v)) {
    return v[lang] != null ? v[lang] : (v.en ?? v.zh ?? '');
  }
  return v;
}
