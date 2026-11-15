/* =====================================================================
 * app.js - logic + vẽ giao diện. KHÔNG chứa câu hỏi (câu hỏi nằm trong data/*.json).
 * Điều hướng bằng hash (#/bai-1, #/bai-1/lam, #/bai-1/ket-qua):
 *  - chạy được cả khi mở file:// lẫn host tĩnh, không cần cấu hình server
 *  - nút Back của Android đóng bảng bài / quay lại đúng màn
 * Muốn URL sạch (/bai-1): đổi sang History API + rewrite về index.html (sửa hàm go() và route()).
 * ===================================================================== */
"use strict";
const $ = s => document.querySelector(s), app = $("#app"), sheet = $("#sheet");
const I = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const ICON = { back: I("M15 18l-6-6 6-6"), next: I("M9 18l6-6-6-6"), down: I("M6 9l6 6 6-6") };
const TF = [0, .1, .25, .5, 1];                   // điểm câu Đúng/Sai theo số ý đúng (0..4 ý)
const TIMES = [5, 10, 15, 20, 30, 0];             // các mốc thời gian (phút). 0 = không giới hạn
const HINT = { mcq: "Chọn 1 đáp án", tf: "Chọn Đúng hoặc Sai cho từng ý", short: "Trả lời ngắn: nhập đáp án" };
const L = "ABCDEFGH";
const cfg = { n: 10, mins: 15, shuffle: true };   // lựa chọn ở bảng bài (nhớ giữa các bài trong lúc đang mở web)
let S = null;                                     // phiên làm bài hiện tại (null = chưa làm)

/* ---------- nạp dữ liệu từ data/*.json ----------
 * data/lessons.json = tên web + danh sách bài. data/bai-N.json = câu hỏi của bài N.
 * File chưa có (404) = bài chưa soạn, không phải lỗi. Câu sai cấu trúc (xem validate.js) bị ẨN và báo ở trang chủ, các câu còn lại vẫn làm bình thường. */
let LESSONS = [], APP = {}, ERRS = [], ready = false;
const J = async u => { const r = await fetch(u, { cache: "no-cache" }); if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };   // no-cache: thay file xong người khác thấy bản mới
async function load() {
  const m = await J("data/lessons.json"); if (!m || !Array.isArray(m.lessons)) throw new Error("Không đọc được data/lessons.json");
  APP = m.app || {}; ERRS = [];
  LESSONS = await Promise.all(m.lessons.map(async l => {
    const o = { id: l.id, title: l.title, questions: [] };
    try {
      const d = await J(`data/${l.id}.json`);
      if (d) {
        if (!Array.isArray(d.questions)) throw new Error('thiếu mảng "questions"');
        d.questions.forEach((q, i) => { const e = checkQ(q); e ? ERRS.push({ id: l.id, n: i + 1, msg: e }) : o.questions.push({ ...q, rid: `${l.id} · câu ${i + 1}` }); });   // rid = mã câu để "Báo sai"
      }
    } catch (x) { ERRS.push({ id: l.id, n: 0, msg: "file không đọc được: " + x.message }); }   // 1 file hỏng không làm sập bài khác
    return o;
  }));
}
const SKEL = `<div class="wrap"><div class="hero"><div class="sk" style="height:44px;max-width:300px;margin:0 auto 12px"></div><div class="sk" style="height:20px;max-width:420px;margin:0 auto"></div></div><div class="list">${'<div class="sk"></div>'.repeat(6)}</div></div>`;
function boot() { app.dataset.v = "load"; app.innerHTML = SKEL; load().then(() => { ready = true; route(); }).catch(fail); }
function fail(x) {                                // không nạp được lessons.json: báo rõ + nút thử lại
  app.dataset.v = "fail";
  app.innerHTML = `<div class="wrap"><div class="hero"><h1>Không tải được dữ liệu</h1><p class="intro">${location.protocol === "file:" ? "Bạn đang mở bằng file://, trình duyệt chặn đọc file JSON. Hãy mở bằng Live Server (VSCode) hoặc bản đã đăng lên GitHub Pages." : "Kiểm tra mạng và file data/lessons.json rồi thử lại."}</p><p class="intro">${esc(x.message)}</p><button class="btn" style="margin-top:16px" data-a="retry">Thử lại</button></div></div>`;
}
const cnt = l => { const e = ERRS.filter(x => x.id === l.id).length; return (l.questions.length ? l.questions.length + " câu" : "Chưa có câu") + (e ? ` · <i class="warn">${e} lỗi</i>` : ""); };
const errBox = () => ERRS.length ? `<details class="err"><summary>${ERRS.length} lỗi dữ liệu. Câu lỗi đã bị ẩn, phần còn lại vẫn làm bình thường</summary><ul>${ERRS.map(e => `<li><b>${e.id}.json</b>${e.n ? " · câu " + e.n : ""}: ${esc(e.msg)}</li>`).join("")}</ul></details>` : "";
/* "Báo sai": copy mã câu + nội dung + đáp án hiện tại vào clipboard để dán cho Claude sửa */
const plain = h => String(h).replace(/<[^>]+>/g, "");
const copy = t => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const x = document.createElement("textarea"); x.value = t; document.body.append(x); x.select(); document.execCommand("copy"); x.remove(); });
const report = q => `[${q.rid}] ${plain(q.q)}\nĐáp án hiện tại: ` +
  (q.type === "mcq" ? `${L[q.answer]} (theo thứ tự trong file) = ${plain(q.options[q.answer])}` : q.type === "tf" ? q.items.map((x, i) => "abcd"[i] + "=" + (x.a ? "Đúng" : "Sai")).join(", ") : [].concat(q.answer).join(" / ")) + "\nVấn đề: ";

/* ---------- tiện ích ---------- */
const num = l => l.id.replace("bai-", "");
const find = id => LESSONS.find(l => l.id === id);
const go = (h, rep) => rep ? location.replace(h) : (location.hash = h);   // rep=true: thay history, không thêm mục mới
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));   // chữ người dùng gõ phải escape
const norm = s => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");          // chuẩn hoá đáp án ngắn
const fmt = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
const stop = () => { if (S) clearInterval(S.tm); S = null; };

/* ---------- chấm điểm (hàm thuần, dễ test) ---------- */
const accepted = q => [].concat(q.answer).map(norm);
function score(it) {                              // trả về 0..1 điểm của 1 câu
  const q = it.q;
  if (q.type === "mcq") return it.a === q.answer ? 1 : 0;
  if (q.type === "tf") return TF[q.items.filter((x, i) => it.a[i] === x.a).length];
  return (norm(it.a) !== "" && accepted(q).includes(norm(it.a))) ? 1 : 0;
}
const answered = it => it.q.type === "mcq" ? it.a != null : it.q.type === "tf" ? it.a.some(v => v != null) : norm(it.a) !== "";
const pct = () => S.items.filter(answered).length / S.items.length * 100 + "%";

/* ---------- bắt đầu / nộp bài / đồng hồ ---------- */
function start(l) {
  const total = l.questions.length; if (!total) return;
  const n = (!cfg.n || cfg.n >= total) ? total : cfg.n;                 // bóc n câu từ ngân hàng
  const qs = (cfg.shuffle ? shuffle(l.questions) : l.questions.slice()).slice(0, n);
  stop();
  S = { lesson: l, cur: 0, done: false, dir: "", filter: "all", t0: Date.now(), end: cfg.mins ? Date.now() + cfg.mins * 60000 : null,
    items: qs.map(q => ({ q,
      a: q.type === "tf" ? q.items.map(() => null) : q.type === "mcq" ? null : "",   // đáp án người dùng chọn
      ord: q.type === "mcq" ? (cfg.shuffle && !q.noShuffle ? shuffle : x => x)(q.options.map((_, i) => i)) : null })) };   // thứ tự hiển thị đáp án ABCD
  S.tm = setInterval(tick, 1000);
  go("#/" + l.id + "/lam", true);                 // thay mục bảng bài trong history => Back từ bài làm về thẳng trang chủ
}
const clockText = () => S.end ? Math.max(0, Math.round((S.end - Date.now()) / 1000)) : Math.round((Date.now() - S.t0) / 1000);
function tick() {
  if (!S || S.done) return;
  const s = clockText(), c = $("#clock");
  if (c) { c.textContent = fmt(s); c.classList.toggle("low", !!S.end && s <= 60); }
  if (S.end && s <= 0) submit(true);                                    // hết giờ tự nộp
}
const unanswered = () => S.items.filter(i => !answered(i)).length;
function submit(force) {                          // force=true: nộp luôn không hỏi (hết giờ, hoặc đã bấm "Nộp bài" trong hộp thoại)
  if (!S || S.done) return;
  const left = unanswered();
  if (!force && left) return ask("Chưa làm hết", `Còn ${left} câu chưa trả lời. Nộp bài luôn?`, [["d-submit", "Nộp bài"], ["d-stay", "Làm tiếp", "ghost"]]);
  closeAsk();
  S.done = true; S.used = Math.round((Date.now() - S.t0) / 1000); clearInterval(S.tm);
  go("#/" + S.lesson.id + "/ket-qua", true);
}
const to = i => { if (i < 0 || i >= S.items.length) return; S.dir = i > S.cur ? "r" : "l"; S.cur = i; quiz(); scrollTo(0, 0); };

/* ---------- hộp thoại xác nhận ----------
 * Tự vẽ, KHÔNG dùng confirm() của trình duyệt: trong iframe/WebView nó hay bị chặn và trả về "không" => nút trông như đứng im.
 * btns = [[hành động data-a, nhãn, class thêm]] */
const dlg = $("#dlg"); let dlgOn = false;
function ask(title, text, btns) {
  dlg.innerHTML = `<div class="backdrop" data-a="d-stay"></div><div class="sheet" role="alertdialog" aria-modal="true"><h2>${title}</h2><p class="cnt">${text}</p>` +
    btns.map(([a, t, c]) => `<button class="btn ${c || ""}" style="width:100%;margin-top:8px" data-a="${a}">${t}</button>`).join("") + `</div>`;
  dlg.hidden = false;
  if (!dlgOn) { dlg.classList.remove("show"); void dlg.offsetWidth; requestAnimationFrame(() => dlg.classList.add("show")); }
  dlgOn = true;
}
function closeAsk() { if (!dlgOn) return; dlgOn = false; dlg.classList.remove("show"); setTimeout(() => { if (!dlgOn) dlg.hidden = true; }, 400); }
function askLeave() {                             // bấm nút quay lại hoặc Back khi đang làm dở: hỏi nộp bài
  const left = unanswered();
  ask("Nộp bài trước khi rời đi?", left ? `Bạn còn ${left} câu chưa trả lời.` : "Bạn đã trả lời hết các câu.",
    [["d-submit", "Nộp bài"], ["d-stay", "Làm tiếp", "ghost"], ["d-quit", "Thoát, không nộp", "quiet"]]);
}

/* ---------- router ---------- */
function route() {
  const [, id, sub] = location.hash.split("/"), l = id && find(id);
  if (S && !S.done && !(sub === "lam" && id === S.lesson.id)) {   // đang làm dở mà bị Back/đổi link: giữ nguyên bài, đẩy lại mục history và hỏi
    history.pushState(null, "", "#/" + S.lesson.id + "/lam"); return askLeave();
  }
  if (id && !l) return go("#/", true);
  if (!l || !sub) { stop(); home(); l ? openSheet(l) : closeSheet(); return; }   // #/  hoặc  #/bai-1 (hiện bảng bài)
  closeSheet();
  if (!S || S.lesson.id !== id || (sub === "ket-qua") !== S.done) return go("#/" + id, true);   // vào thẳng link làm bài khi chưa có phiên => về bảng bài
  scrollTo(0, 0);
  sub === "lam" ? quiz() : sub === "ket-qua" ? result() : go("#/" + id, true);
}

/* ---------- màn 1: danh sách bài ---------- */
function home() {
  if (app.dataset.v === "home") return; app.dataset.v = "home";          // đã vẽ rồi thì thôi, tránh chạy lại animation khi mở/đóng bảng
  app.innerHTML = `<div class="wrap"><div class="hero"><h1>${APP.title}</h1><p class="intro">${APP.intro}</p><span class="meta">${APP.sub}</span></div>${errBox()}<div class="list"><h2>Luyện tập theo từng bài</h2>` +
    LESSONS.map((l, i) => `<a class="lc" href="#/${l.id}" style="--i:${i}"><span><b>Bài ${num(l)}</b> · ${l.title}</span><small>${cnt(l)}</small></a>`).join("") + `</div></div>`;
}

/* ---------- bảng bài (modal PC / bottom sheet Android) ---------- */
let sheetOn = false;
function openSheet(l) {
  const t = l.questions.length, eff = (!cfg.n || cfg.n >= t) ? 0 : cfg.n, ns = [10, 20].filter(v => v < t).concat(0);
  sheet.innerHTML = `<div class="backdrop" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"><i></i></div>
    <h2>Bài ${num(l)}</h2><p class="sub">${l.title}</p>` + (t ? `<p class="cnt">Ngân hàng có <b>${t}</b> câu</p>
    <h3>Số câu làm</h3><div class="chips">${ns.map(v => `<button class="chip${v === eff ? " on" : ""}" data-a="n" data-v="${v}">${v || "Tất cả (" + t + ")"}</button>`).join("")}</div>
    <h3>Thời gian</h3><div class="chips">${TIMES.map(m => `<button class="chip${m === cfg.mins ? " on" : ""}" data-a="m" data-v="${m}">${m ? m + " phút" : "Không giới hạn"}</button>`).join("")}</div>
    <label class="sw">Xáo thứ tự câu hỏi<input type="checkbox" data-a="sh"${cfg.shuffle ? " checked" : ""}></label>
    <button class="btn" style="width:100%" data-a="start">Bắt đầu làm bài</button>` : `<p class="cnt">Chưa có câu hỏi cho bài này.</p>`) + `</div>`;
  sheet.hidden = false;
  if (!sheetOn) { sheet.classList.remove("show"); void sheet.offsetWidth; requestAnimationFrame(() => sheet.classList.add("show")); }   // bật class ở frame sau để có animation
  sheetOn = true;
}
function closeSheet() {
  if (!sheetOn) return; sheetOn = false;
  const s = sheet.querySelector(".sheet"); if (s) { s.style.transition = ""; s.style.transform = ""; }   // trả quyền cho CSS, nó tự trượt từ vị trí đang kéo xuống hết
  sheet.classList.remove("show");
  setTimeout(() => { if (!sheetOn) sheet.hidden = true; }, 400);
}
/* Vuốt xuống để đóng: bám ngón tay 1:1 khi kéo, thả ra thì đóng nếu kéo >100px hoặc vuốt nhanh, không thì bật về */
let drag = null;
sheet.addEventListener("pointerdown", e => {
  const g = e.target.closest(".grab"); if (!g) return;
  g.setPointerCapture(e.pointerId);
  drag = { y: e.clientY, dy: 0, t: Date.now(), s: sheet.querySelector(".sheet") }; drag.s.style.transition = "none";
});
sheet.addEventListener("pointermove", e => { if (!drag) return; drag.dy = Math.max(0, e.clientY - drag.y); drag.s.style.transform = `translateY(${drag.dy}px)`; });
const endDrag = () => { if (!drag) return; const d = drag; drag = null; d.s.style.transition = ""; (d.dy > 100 || d.dy / (Date.now() - d.t) > .6) ? go("#/") : d.s.style.transform = ""; };
sheet.addEventListener("pointerup", endDrag); sheet.addEventListener("pointercancel", endDrag);

/* ---------- màn 2: làm bài (1 câu / màn) ---------- */
function quiz() {
  app.dataset.v = "quiz";
  const it = S.items[S.cur], q = it.q, n = S.items.length; let body = "";
  if (q.type === "mcq") body = it.ord.map((o, k) => `<button class="op${it.a === o ? " on" : ""}" data-a="mc" data-v="${o}"><span class="k">${L[k]}</span><span>${q.options[o]}</span></button>`).join("");
  else if (q.type === "tf") body = q.items.map((x, i) => `<div class="tf"><p><b>${"abcd"[i]})</b> ${x.t}</p><div class="chips">` +
    [[1, "Đúng"], [0, "Sai"]].map(([v, t]) => `<button class="chip${it.a[i] === !!v ? " on" : ""}" data-a="tf" data-i="${i}" data-v="${v}">${t}</button>`).join("") + `</div></div>`).join("");
  else body = `<input class="fld" id="sa" autocomplete="off" placeholder="Nhập đáp án" value="${esc(it.a)}">`;
  app.innerHTML = `<header class="bar"><button class="ico" data-a="exit" aria-label="Thoát">${ICON.back}</button><b>Bài ${num(S.lesson)}</b><span class="clock" id="clock">${fmt(clockText())}</span></header>
    <div class="prog"><i style="width:${pct()}"></i></div>
    <main class="quiz"><section class="card ${S.dir}"><div class="no">Câu ${S.cur + 1} / ${n}</div><div class="qt">${q.q}</div><p class="hint">${HINT[q.type]}</p>${body}</section>
    <aside class="pal"><h3>Danh sách câu</h3><div class="pg">${S.items.map((x, i) => `<button class="pc${answered(x) ? " done" : ""}${i === S.cur ? " cur" : ""}" data-a="jump" data-v="${i}">${i + 1}</button>`).join("")}</div>
    <button class="btn ghost" style="width:100%;margin-top:12px" data-a="submit">Nộp bài</button></aside></main>
    <footer class="nav"><div><button class="btn ghost" data-a="prev"${S.cur ? "" : " disabled"}>${ICON.back} Trước</button><span>${S.cur + 1}/${n}</span>` +
    (S.cur < n - 1 ? `<button class="btn" data-a="next">Sau ${ICON.next}</button>` : `<button class="btn" data-a="submit">Nộp bài</button>`) + `</div></footer>`;
  S.dir = "";
}

/* ---------- màn 3: kết quả ---------- */
function result() {
  app.dataset.v = "result";
  const its = S.items, sc = its.map(score), pts = Math.round(sc.reduce((a, b) => a + b, 0) / its.length * 1000) / 100, ok = sc.filter(s => s === 1).length;
  const rev = ({ it, i, s }) => {
    const q = it.q; let b = "";
    if (q.type === "mcq") b = it.ord.map((o, k) => `<div class="op${o === q.answer ? " right" : o === it.a ? " wrong" : ""}"><span class="k">${L[k]}</span><span>${q.options[o]}</span>${o === it.a ? "<em>Bạn chọn</em>" : ""}</div>`).join("") + (it.a == null ? `<p class="hint">Bạn chưa trả lời câu này.</p>` : "");
    else if (q.type === "tf") b = q.items.map((x, k) => { const u = it.a[k]; return `<div class="tf ${u === x.a ? "ok" : "bad"}"><p><b>${"abcd"[k]})</b> ${x.t}</p><small>Bạn: ${u == null ? "—" : u ? "Đúng" : "Sai"} · Đáp án: ${x.a ? "Đúng" : "Sai"}</small></div>`; }).join("");
    else b = `<div class="tf ${s ? "ok" : "bad"}"><p>Bạn trả lời: <b>${esc(it.a) || "—"}</b></p><small>Đáp án: ${esc([].concat(q.answer).join(" hoặc "))}</small></div>`;
    return `<article class="rv ${s === 1 ? "ok" : s ? "part" : "bad"}"><div class="rh"><span class="no">Câu ${i + 1}</span><span class="tag">${s === 1 ? "Đúng" : s ? "Đúng một phần" : "Sai"}</span></div><div class="qt">${q.q}</div>${b}` +
      `<div class="acts">${q.explain ? `<button class="ex" data-a="ex" aria-expanded="false">Xem giải thích ${ICON.down}</button>` : ""}<button class="ex rp" data-a="rp" data-i="${i}">Báo sai</button></div>${q.explain ? `<div class="exb"><div><div class="exi">${q.explain}</div></div></div>` : ""}</article>`;
  };
  const list = its.map((it, i) => ({ it, i, s: sc[i] })).filter(x => S.filter === "all" || x.s < 1);
  app.innerHTML = `<header class="bar"><button class="ico" data-a="list" aria-label="Về danh sách">${ICON.back}</button><b>Kết quả · Bài ${num(S.lesson)}</b></header>
    <main class="wrap nw"><section class="score"><b>${pts}</b><p class="sub">/ 10 điểm · đúng ${ok}/${its.length} câu · ${fmt(S.used)}</p>
    <div class="chips" style="justify-content:center;margin-top:16px"><button class="btn" data-a="again">Làm lại bài</button><button class="btn ghost" data-a="list">Về danh sách</button></div></section>
    <div class="chips">${[["all", "Tất cả"], ["bad", "Câu chưa đúng"]].map(([v, t]) => `<button class="chip${S.filter === v ? " on" : ""}" data-a="flt" data-v="${v}">${t}</button>`).join("")}</div>
    <div class="rvs">${list.map(rev).join("") || `<p class="sub">Không có câu nào sai.</p>`}</div></main>`;
}

/* ---------- sự kiện: 1 chỗ duy nhất (event delegation qua data-a) ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a, v = b.dataset.v, pick = k => { b.parentNode.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === b)); cfg[k] = +v; };
  if (!S && /^(mc|tf|jump|prev|next|submit|exit|d-submit|flt|again|rp)$/.test(a)) return;   // phiên đã mất (bấm đúp rất nhanh lúc đang thoát): bỏ qua thay vì báo lỗi
  if (a === "close" || a === "list") go("#/");
  else if (a === "n") pick("n");
  else if (a === "m") pick("mins");
  else if (a === "sh") cfg.shuffle = b.checked;
  else if (a === "start") start(find(location.hash.split("/")[1]));
  else if (a === "mc") { S.items[S.cur].a = +v; quiz(); }
  else if (a === "tf") { S.items[S.cur].a[+b.dataset.i] = v === "1"; quiz(); }
  else if (a === "jump") to(+v);
  else if (a === "prev") to(S.cur - 1);
  else if (a === "next") to(S.cur + 1);
  else if (a === "submit") submit();
  else if (a === "exit") askLeave();
  else if (a === "d-submit") submit(true);
  else if (a === "d-stay") closeAsk();
  else if (a === "d-quit") { closeAsk(); stop(); go("#/", true); }
  else if (a === "ex") { const r = b.closest(".rv"); b.setAttribute("aria-expanded", r.classList.toggle("open")); }   // bung/gập giải thích ngay tại chỗ
  else if (a === "flt") { S.filter = v; result(); }
  else if (a === "again") start(S.lesson);
  else if (a === "retry") boot();
  else if (a === "rp") copy(report(S.items[+b.dataset.i].q)).then(() => { b.textContent = "Đã sao chép, dán cho Claude để sửa"; setTimeout(() => b.textContent = "Báo sai", 2500); });
});
document.addEventListener("input", e => {                                 // ô trả lời ngắn: cập nhật state, KHÔNG vẽ lại (để khỏi mất focus)
  if (e.target.id !== "sa" || !S) return;
  const it = S.items[S.cur]; it.a = e.target.value;
  const c = $(`.pc[data-v="${S.cur}"]`); if (c) c.classList.toggle("done", answered(it));
  $(".prog i").style.width = pct();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") dlgOn ? closeAsk() : sheetOn && go("#/"); });
addEventListener("beforeunload", e => { if (S && !S.done) { e.preventDefault(); e.returnValue = ""; } });   // lỡ tay đóng tab khi đang làm
addEventListener("hashchange", () => ready && route());   // chưa nạp xong dữ liệu thì chưa định tuyến
boot();
