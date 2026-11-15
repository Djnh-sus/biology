/* validate.js - kiểm tra 1 câu hỏi có đúng cấu trúc không. Dùng chung cho app.js và kiem-tra.html.
 * checkQ(q) trả về "" nếu hợp lệ, ngược lại trả về lý do lỗi (tiếng Việt). Câu lỗi sẽ bị web ẨN. */
window.checkQ = function (q) {
  if (!q || typeof q !== "object") return "không phải object";
  if (typeof q.q !== "string" || !q.q.trim()) return "thiếu nội dung câu hỏi (q)";
  if (q.type === "mcq") {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8 || q.options.some(o => typeof o !== "string" || !o.trim())) return "options phải là mảng 2-8 chuỗi không rỗng";
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) return "answer phải là số nguyên từ 0 đến " + (q.options.length - 1);
  } else if (q.type === "tf") {
    if (!Array.isArray(q.items) || q.items.length !== 4) return "câu đúng/sai cần đúng 4 ý trong items";
    if (q.items.some(x => !x || typeof x.t !== "string" || !x.t.trim() || typeof x.a !== "boolean")) return "mỗi ý cần t (chuỗi) và a (true/false)";
  } else if (q.type === "short") {
    const a = [].concat(q.answer);
    if (!a.length || a.some(x => (typeof x !== "string" && typeof x !== "number") || String(x).trim() === "")) return "answer cần là chuỗi/số hoặc mảng chuỗi, không rỗng";
  } else return `type "${q.type}" không hợp lệ (chỉ mcq | tf | short)`;
  if (q.explain != null && typeof q.explain !== "string") return "explain phải là chuỗi";
  if (q.noShuffle != null && typeof q.noShuffle !== "boolean") return "noShuffle phải là true hoặc false";   // cờ tuỳ chọn: true = giữ nguyên thứ tự options của câu này
  return "";
};

/* warnQ(q) trả về mảng CẢNH BÁO (câu vẫn hiện bình thường). Chỉ kiem-tra.html dùng, để bắt các lỗi soạn đề hay gặp.
 * Quét bằng quy tắc nên chỉ là gợi ý ("có vẻ"), có thể báo nhầm hoặc sót. Gọi sau khi checkQ(q) đã trả "". */
window.warnQ = function (q) {
  const w = [], pl = h => String(h).replace(/<[^>]+>/g, ""), ex = pl(q.explain || "");
  const all = pl([q.q, ...(q.options || []), ...(q.items || []).map(x => x.t)].join(" ")) + " " + ex;
  if (!q.explain) w.push("thiếu explain");
  if (/\b[Hh]ình\s*(bên|\d)/.test(all)) w.push('nhắc "Hình ..." nhưng web không có hình, hãy mô tả bằng lời');
  if (q.type === "mcq") {
    // nhãn A-D trong explain sẽ SAI khi web xáo đáp án: bắt các kiểu "(B)", "chọn nhầm A", "Bẫy: D dùng từ...", "A là ..."
    if (/\(\s*[ABCD]\s*\)|(?:chọn(?: nhầm| sai)?|nhầm(?: với)?|phương án|đáp án)\s+[ABCD]\b|(?:^|[.;:!?]\s+|Bẫy:\s*)[ABCD]\s+(?:là|sai|đúng|mô tả|dùng|chỉ|mới|nói|diễn đạt|đảo|thiếu|thừa)(?![A-Za-zÀ-ỹ])/.test(ex))   // lookahead thay \b vì \b của JS không nhận chữ có dấu
      w.push("explain có vẻ nhắc nhãn A-D, xáo đáp án sẽ làm sai nhãn (hãy viết bằng nội dung)");
    if (q.options.every(o => /^\s*\d+\s*$/.test(pl(o))) && !q.noShuffle) w.push('options toàn số (câu đếm?), nên thêm "noShuffle": true để xáo không làm lộn thứ tự');
  }
  if (q.type === "tf" && /(?:^|[^A-Za-zÀ-ỹ])[ABCD] (?:đúng|sai)\b/.test(ex)) w.push('explain viết "D sai" chữ hoa, web hiện các ý là a) b) c) d) chữ thường');
  return w;
};
