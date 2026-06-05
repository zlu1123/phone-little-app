// utils/date.js
// 统一的日期解析工具：兼容 iOS / Safari / 微信 iOS WebView 对非 ISO 格式的解析问题。
//
// 背景：
//  - 后端常返回 "2026-06-05 17:30:00" / "2026-06-05" / "2026/06/05 17:30:00" 等格式
//  - Android / Node 上 new Date(str) 能容错解析；iOS 严格遵循 ECMAScript 规范，
//    遇到非 ISO 格式（带空格、用 "/" 等）会返回 Invalid Date (NaN)。
//  - 直接拿 Invalid Date 的时间戳做比较，会导致诸如 "保修是否过期" 的判断异常。
//
// 解决方案：把字符串规范化为 iOS 也能解析的形式后再交给 new Date。

/**
 * 把任意常见格式的日期字符串规范化为 iOS / 全平台可解析的形式。
 * 规则：
 *  1. 非字符串/数字/Date 之外的输入直接返回 null
 *  2. 字符串内的 "/" 一律替换为 "-"
 *  3. 形如 "yyyy-MM-dd HH:mm:ss[.SSS]" 的字符串，把日期与时间之间的空格替换为 "T"
 *  4. 仅有日期 "yyyy-MM-dd" 的字符串保持不变（iOS 可解析）
 *  5. 已包含 "T" 的 ISO 字符串保持不变
 */
const normalizeDateString = (input) => {
  if (input == null) return null;
  if (input instanceof Date) return input;
  if (typeof input === 'number') return input;
  if (typeof input !== 'string') return null;

  let str = input.trim();
  if (!str) return null;

  // "yyyy/MM/dd ..." -> "yyyy-MM-dd ..."
  str = str.replace(/\//g, '-');

  // "yyyy-MM-dd HH:mm:ss" -> "yyyy-MM-ddTHH:mm:ss"
  // 仅替换日期与时间之间的第一个空格
  str = str.replace(/^(\d{4}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{1,2}(?::\d{1,2}(?:\.\d+)?)?)/, '$1T$2');

  return str;
};

/**
 * iOS 兼容的 Date 构造器。
 * 接收任意常见格式的日期参数，返回有效的 Date 对象；解析失败时返回 null。
 *
 * @param {string|number|Date} input
 * @returns {Date|null}
 */
const parseDate = (input) => {
  if (input == null || input === '') return null;

  const normalized = normalizeDateString(input);
  if (normalized == null) return null;

  const date = normalized instanceof Date ? normalized : new Date(normalized);
  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
};

/**
 * iOS 兼容的时间戳解析。解析失败时返回 NaN（保留 NaN 语义，方便调用方按需兜底）。
 *
 * @param {string|number|Date} input
 * @returns {number} 毫秒时间戳，失败时返回 NaN
 */
const parseDateTime = (input) => {
  const date = parseDate(input);
  return date ? date.getTime() : NaN;
};

module.exports = {
  parseDate,
  parseDateTime,
  normalizeDateString
};
