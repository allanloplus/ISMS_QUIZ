(function () {
  "use strict";

  var CFG = window.QUIZ_CONFIG;
  var COURSES = window.COURSES;
  var LETTERS = ["A", "B", "C", "D", "E", "F"];
  var PROFILE_KEY = "isms-quiz-profile";
  var HISTORY_KEY = "isms-quiz-history";

  var state = { course: null, profile: null, result: null };

  // ---------- 工具函式 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(d) { return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日"; }
  function fmtDateStr(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? m[1] + " 年 " + Number(m[2]) + " 月 " + Number(m[3]) + " 日" : s;
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function fmtStamp(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function totalPoints(course) {
    return course.questions.reduce(function (s, q) { return s + q.points; }, 0);
  }

  function answerLabel(q, a) {
    if (a == null || a === "") return "未作答";
    if (q.type === "tf") return a ? "○" : "╳";
    return a;
  }

  function makeCertNo(course, date) {
    var rand = "";
    var bytes = new Uint8Array(3);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) rand += ("0" + bytes[i].toString(16)).slice(-2);
    return CFG.certPrefix + "-" + course.id + "-" + date.getFullYear() + pad(date.getMonth() + 1) +
      pad(date.getDate()) + "-" + rand.toUpperCase();
  }

  // 是否被嵌入於其他網頁（如 Google Sites）的 iframe 中
  var FRAMED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // 頁內確認視窗：Google Sites 等沙箱 iframe 會封鎖 window.confirm()，故不使用瀏覽器原生對話框
  function confirmDialog(message, okText) {
    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var wrap = document.createElement("div");
      wrap.className = "modal-backdrop";
      wrap.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-msg">' +
        '<p id="modal-msg">' + esc(message) + "</p>" +
        '<div class="actions actions-center">' +
        '<button type="button" class="btn btn-ghost" data-v="0">取消</button>' +
        '<button type="button" class="btn btn-primary" data-v="1">' + esc(okText || "確定") + "</button>" +
        "</div></div>";
      function close(v) {
        document.removeEventListener("keydown", onKey, true);
        wrap.parentNode && wrap.parentNode.removeChild(wrap);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(v);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(false); }
      }
      wrap.addEventListener("click", function (e) {
        var b = e.target.closest("[data-v]");
        if (b) close(b.getAttribute("data-v") === "1");
        else if (e.target === wrap) close(false);
      });
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(wrap);
      $('[data-v="1"]', wrap).focus();
    });
  }

  // ---------- 畫面切換 ----------
  function show(view) {
    $all(".view").forEach(function (v) { v.hidden = v.id !== "view-" + view; });
    window.scrollTo(0, 0);
  }

  function fillStatic() {
    document.title = CFG.siteTitle;
    $("#site-title").textContent = CFG.siteTitle;
    $("#site-category").textContent = CFG.category;
    $all(".js-pass").forEach(function (el) { el.textContent = CFG.passScore; });
    $all(".js-instructor").forEach(function (el) { el.textContent = CFG.instructor; });
    $all(".js-category").forEach(function (el) { el.textContent = CFG.category; });
  }

  // ---------- 首頁 ----------
  function renderHome() {
    var history = store(HISTORY_KEY) || [];
    $("#course-grid").innerHTML = COURSES.map(function (c, i) {
      var tf = c.questions.filter(function (q) { return q.type === "tf"; }).length;
      var mc = c.questions.length - tf;
      var passed = history.some(function (h) { return h.courseId === c.id && h.passed; });
      var parts = [];
      if (tf) parts.push("是非題 " + tf + " 題");
      if (mc) parts.push("選擇題 " + mc + " 題");
      return '<article class="course-card">' +
        '<div class="course-no">課程 ' + (i + 1) + (passed ? '<span class="badge-pass">已通過</span>' : "") + "</div>" +
        "<h3>" + esc(c.title) + "</h3>" +
        '<p class="muted">' + esc(c.subtitle || "") + "</p>" +
        '<ul class="course-meta"><li>' + parts.join("、") + "</li><li>滿分 " + totalPoints(c) +
        " 分，" + CFG.passScore + " 分及格</li>" + (c.hours ? "<li>課程時數 " + c.hours + " 小時</li>" : "") + "</ul>" +
        '<button class="btn btn-primary btn-block" data-course="' + esc(c.id) + '">進行測驗</button>' +
        "</article>";
    }).join("");
  }

  // ---------- 受測者資料 ----------
  function startCourse(id) {
    state.course = COURSES.filter(function (c) { return c.id === id; })[0];
    if (!state.course) return;
    $all(".js-course-title").forEach(function (el) { el.textContent = state.course.title; });
    var form = $("#info-form");
    form.reset();
    var p = store(PROFILE_KEY);
    if (p) {
      ["company", "dept", "name", "jobTitle", "email"].forEach(function (k) { if (p[k]) form.elements[k].value = p[k]; });
      if (p.mode) $all('input[name="mode"]', form).forEach(function (r) { r.checked = r.value === p.mode; });
    }
    form.elements.classDate.max = todayStr();
    $("#info-error").textContent = "";
    show("info");
  }

  function onInfoSubmit(e) {
    e.preventDefault();
    var f = e.target;
    var data = {
      company: f.elements.company.value.trim(),
      dept: f.elements.dept.value.trim(),
      name: f.elements.name.value.trim(),
      jobTitle: f.elements.jobTitle.value.trim(),
      email: f.elements.email.value.trim(),
      classDate: f.elements.classDate.value,
      mode: (($all('input[name="mode"]:checked', f)[0]) || {}).value || ""
    };
    var labels = { company: "公司名稱", dept: "單位", name: "姓名", jobTitle: "職稱", email: "E-mail", classDate: "實際上課日期", mode: "參加方式" };
    var missing = Object.keys(labels).filter(function (k) { return !data[k]; }).map(function (k) { return labels[k]; });
    $all(".field input", f).forEach(function (inp) { inp.classList.toggle("invalid", inp.required && !inp.value.trim()); });
    var err = "";
    if (missing.length) err = "請填寫：" + missing.join("、");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { err = "E-mail 格式不正確"; f.elements.email.classList.add("invalid"); }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.classDate) || data.classDate > todayStr()) { err = "實際上課日期不正確（不可晚於今天）"; f.elements.classDate.classList.add("invalid"); }
    else if (!f.elements.attended.checked) err = "請勾選確認已完成本課程之上課";
    $("#info-error").textContent = err;
    if (err) return;
    state.profile = data;
    store(PROFILE_KEY, { company: data.company, dept: data.dept, name: data.name, jobTitle: data.jobTitle, email: data.email, mode: data.mode });
    renderQuiz();
    show("quiz");
  }

  // ---------- 測驗 ----------
  function renderQuiz() {
    var c = state.course;
    var tf = c.questions.filter(function (q) { return q.type === "tf"; });
    var mc = c.questions.filter(function (q) { return q.type === "mc"; });
    var html = "";
    var n = 0;

    function block(title, list) {
      if (!list.length) return "";
      var pts = list[0].points;
      var sub = list.reduce(function (s, q) { return s + q.points; }, 0);
      var out = '<h3 class="part-title">' + title + "<small>（每題 " + pts + " 分，共 " + sub + " 分）</small></h3>";
      list.forEach(function (q) {
        var idx = c.questions.indexOf(q);
        n++;
        out += '<fieldset class="q" id="q-' + idx + '"><legend><span class="q-no">' + n + ".</span>" + esc(q.q) + "</legend>";
        out += '<div class="opts ' + (q.type === "tf" ? "opts-tf" : "") + '">';
        if (q.type === "tf") {
          out += opt(idx, "true", "○", "正確") + opt(idx, "false", "╳", "錯誤");
        } else {
          q.options.forEach(function (o, k) { out += opt(idx, LETTERS[k], LETTERS[k], o); });
        }
        out += "</div></fieldset>";
      });
      return out;
    }
    function opt(idx, val, key, text) {
      return '<label class="opt"><input type="radio" name="q' + idx + '" value="' + val + '">' +
        '<span class="opt-key">' + esc(key) + '</span><span class="opt-text">' + esc(text) + "</span></label>";
    }

    if (tf.length) html += block(mc.length ? "一、是非題" : "是非題", tf);
    if (mc.length) html += block(tf.length ? "二、選擇題" : "選擇題", mc);
    $("#quiz-body").innerHTML = html;
    $("#quiz-meta").textContent = "受測者：" + state.profile.name + "（" + state.profile.company + " " +
      state.profile.dept + "）｜上課日期 " + fmtDateStr(state.profile.classDate) + "｜共 " + c.questions.length + " 題，滿分 " + totalPoints(c) + " 分，" + CFG.passScore + " 分及格";
    $("#quiz-error").textContent = "";
    updateProgress();
  }

  function readAnswers() {
    return state.course.questions.map(function (q, i) {
      var el = $('input[name="q' + i + '"]:checked');
      if (!el) return null;
      return q.type === "tf" ? el.value === "true" : el.value;
    });
  }

  function updateProgress() {
    var ans = readAnswers();
    var done = ans.filter(function (a) { return a !== null; }).length;
    $("#progress-text").textContent = done + " / " + ans.length;
    $("#progress-fill").style.width = (ans.length ? (done / ans.length) * 100 : 0) + "%";
  }

  function onQuizSubmit(e) {
    e.preventDefault();
    var c = state.course;
    var ans = readAnswers();
    var firstMissing = ans.indexOf(null);
    $all(".q").forEach(function (fs) { fs.classList.remove("missing"); });
    if (firstMissing !== -1) {
      ans.forEach(function (a, i) { if (a === null) $("#q-" + i).classList.add("missing"); });
      var left = ans.filter(function (a) { return a === null; }).length;
      $("#quiz-error").textContent = "尚有 " + left + " 題未作答，請完成所有題目後再交卷。";
      $("#q-" + firstMissing).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    confirmDialog("確定交卷？交卷後將無法修改答案。", "確定交卷").then(function (ok) {
      if (ok) gradeQuiz(ans);
    });
  }

  function gradeQuiz(ans) {
    var c = state.course;
    var score = 0;
    var correct = 0;
    c.questions.forEach(function (q, i) {
      if (ans[i] === q.answer) { score += q.points; correct++; }
    });
    var total = totalPoints(c);
    var pct = Math.round((score / total) * 100);
    var now = new Date();
    var passed = pct >= CFG.passScore;
    state.result = {
      answers: ans, score: pct, raw: score, total: total, correct: correct,
      passed: passed, date: now, certNo: passed ? makeCertNo(c, now) : ""
    };

    var history = store(HISTORY_KEY) || [];
    history.push({ courseId: c.id, score: pct, passed: passed, certNo: state.result.certNo, at: now.toISOString() });
    store(HISTORY_KEY, history.slice(-50));
    sendRecord();

    renderResult();
    show("result");
  }

  // ---------- 紀錄回傳（選用） ----------
  function sendRecord() {
    if (!CFG.recordEndpoint) return;
    var c = state.course, r = state.result, p = state.profile;
    var payload = {
      timestamp: r.date.toISOString(),
      courseId: c.id, courseTitle: c.title, hours: c.hours || "", category: CFG.category, instructor: CFG.instructor,
      company: p.company, dept: p.dept, name: p.name, jobTitle: p.jobTitle, email: p.email, mode: p.mode, classDate: p.classDate,
      score: r.score, passed: r.passed, certNo: r.certNo,
      answers: r.answers.map(function (a, i) { return answerLabel(c.questions[i], a); }).join(",")
    };
    try {
      fetch(CFG.recordEndpoint, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) { /* 忽略回傳失敗，不影響受測者 */ }
  }

  // ---------- 結果 ----------
  function renderResult() {
    var c = state.course, r = state.result, p = state.profile;
    var card = $("#result-card");
    card.classList.toggle("is-pass", r.passed);
    card.classList.toggle("is-fail", !r.passed);
    var head =
      '<div class="score-ring" style="--pct:' + r.score + '"><div><b>' + r.score + "</b><small>分</small></div></div>" +
      '<p class="eyebrow">' + esc(c.title) + "</p>";

    if (r.passed) {
      card.innerHTML = head +
        "<h2>恭喜通過測驗！</h2>" +
        '<p class="muted">' + esc(p.name) + " 您好，您答對 " + r.correct + " / " + c.questions.length +
        " 題，成績 " + r.score + " 分（及格分數 " + CFG.passScore + " 分）。</p>" +
        '<dl class="kv"><dt>證書編號</dt><dd>' + esc(r.certNo) + "</dd><dt>測驗日期</dt><dd>" + fmtDate(r.date) + "</dd></dl>" +
        '<p class="muted small">結業證書 PDF 包含：證書一頁，以及測驗題目、您的作答與正確解答。</p>' +
        '<div class="actions actions-center">' +
        '<button class="btn btn-primary" id="btn-pdf">下載結業證書（PDF）</button>' +
        '<button class="btn btn-ghost" id="btn-print">列印／另存 PDF</button>' +
        "</div>" +
        '<p class="pdf-status" id="pdf-status" role="status"></p>' +
      '<p class="pdf-status" id="pdf-link" hidden>若下載沒有開始，請 <a target="_blank" rel="noopener">在新分頁開啟 PDF</a> 後再儲存或列印。</p>' +
        '<div class="actions actions-center"><button class="btn btn-link" data-nav="home">回課程列表</button></div>';
      buildPrintable();
      $("#btn-pdf").addEventListener("click", downloadPdf);
      // iframe 沙箱（如 Google Sites）會封鎖列印對話框，改由新分頁開啟 PDF 列印
      if (FRAMED) $("#btn-print").hidden = true;
      else $("#btn-print").addEventListener("click", function () { window.print(); });
    } else {
      card.innerHTML = head +
        "<h2>未通過測驗</h2>" +
        '<p class="muted">' + esc(p.name) + " 您好，您本次答對 " + r.correct + " / " + c.questions.length +
        " 題，成績 " + r.score + " 分，未達及格分數 " + CFG.passScore + " 分。</p>" +
        '<div class="notice">' +
        "<b>請您擇一完成後再次測驗：</b>" +
        "<ul><li>重新參加本課程（實體或線上），或</li><li>重新閱讀本課程教材及相關程序書</li></ul>" +
        "為確保學習成效，未通過者不提供題目解答。</div>" +
        '<div class="actions actions-center">' +
        '<button class="btn btn-primary" id="btn-retry">重新測驗</button>' +
        '<button class="btn btn-ghost" data-nav="home">回課程列表</button>' +
        "</div>";
      $("#render-stage").innerHTML = "";
      $("#btn-retry").addEventListener("click", function () {
        renderQuiz();
        show("quiz");
      });
    }
  }

  // ---------- 證書與解答版面 ----------
  function buildPrintable() {
    var c = state.course, r = state.result, p = state.profile;
    var stage = $("#render-stage");
    stage.innerHTML = "";

    var cert = document.createElement("div");
    cert.className = "sheet sheet-cert";
    cert.innerHTML =
      '<div class="cert-frame"><div class="cert-inner">' +
      '<div class="cert-top"><span class="cert-cat">' + esc(CFG.category) + "</span>" +
      '<span class="cert-no">證書編號：' + esc(r.certNo) + "</span></div>" +
      '<h1 class="cert-title">結 業 證 書</h1>' +
      '<p class="cert-sub">CERTIFICATE OF COMPLETION</p>' +
      '<p class="cert-lead">茲 證 明</p>' +
      '<p class="cert-name">' + esc(p.name) + "</p>" +
      '<p class="cert-org">' + esc(p.company) + "　" + esc(p.dept) + "　" + esc(p.jobTitle) + "</p>" +
      '<p class="cert-body">於 ' + esc(fmtDateStr(p.classDate)) + " 參加「" + esc(CFG.category) + "」<br>" +
      '<span class="cert-course">' + esc(c.title) + "</span><br>" +
      "課程（" + esc(p.mode) + (c.hours ? "，課程時數 " + c.hours + " 小時" : "") + "），並通過課後測驗，成績 <b>" + r.score + "</b> 分，特頒此證。</p>" +
      '<div class="cert-foot">' +
      '<div class="cert-sign">' +
      (CFG.signature ? '<img class="sign-img" src="' + esc(CFG.signature) + '" alt="講師簽名">' : '<div class="sign-name">' + esc(CFG.instructor) + "</div>") +
      '<div class="sign-line"></div><div class="sign-label">課程講師　<b>' + esc(CFG.instructor) + "</b></div></div>" +
      '<div class="cert-seal"><svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z"/></svg><span>ISMS</span><small>PASSED</small></div>' +
      '<div class="cert-sign"><div class="sign-name">' + fmtDate(r.date) + '</div><div class="sign-line"></div><div class="sign-label">測驗日期</div></div>' +
      "</div></div></div>";
    stage.appendChild(cert);

    // 解答頁：逐題放入頁面，超出版面時換頁
    var rows = c.questions.map(function (q, i) {
      var ok = r.answers[i] === q.answer;
      var row = document.createElement("div");
      row.className = "ak-row" + (ok ? "" : " ak-wrong");
      var opts = "";
      if (q.type === "mc") {
        opts = '<ol class="ak-opts">' + q.options.map(function (o, k) {
          return '<li class="' + (LETTERS[k] === q.answer ? "is-answer" : "") + '"><b>(' + LETTERS[k] + ")</b> " + esc(o) + "</li>";
        }).join("") + "</ol>";
      }
      row.innerHTML =
        '<div class="ak-no">' + (i + 1) + "</div>" +
        '<div class="ak-q"><div>' + esc(q.q) + "</div>" + opts +
        (q.explain ? '<div class="ak-explain">說明／依據：' + esc(q.explain) + "</div>" : "") + "</div>" +
        '<div class="ak-ans">' + esc(answerLabel(q, r.answers[i])) + "</div>" +
        '<div class="ak-ans ak-correct">' + esc(answerLabel(q, q.answer)) + "</div>" +
        '<div class="ak-res">' + (ok ? "✓" : "✗") + "</div>";
      return row;
    });

    var header =
      '<div class="ak-head"><div><p class="ak-eyebrow">附件　測驗題目與解答</p><h2>' + esc(c.title) + "</h2></div>" +
      '<dl class="ak-info">' +
      "<dt>姓名</dt><dd>" + esc(p.name) + "</dd>" +
      "<dt>公司／單位</dt><dd>" + esc(p.company) + "／" + esc(p.dept) + "</dd>" +
      "<dt>上課日期</dt><dd>" + esc(fmtDateStr(p.classDate)) + (c.hours ? "（" + c.hours + " 小時）" : "") + "</dd>" +
      "<dt>成績</dt><dd>" + r.score + " 分（答對 " + r.correct + "/" + c.questions.length + " 題）</dd>" +
      "<dt>證書編號</dt><dd>" + esc(r.certNo) + "</dd>" +
      "<dt>測驗時間</dt><dd>" + fmtStamp(r.date) + "</dd>" +
      "</dl></div>";
    var colHead = '<div class="ak-row ak-colhead"><div>題號</div><div>題目</div><div>作答</div><div>解答</div><div>結果</div></div>';

    var pages = [];
    function newPage() {
      var pg = document.createElement("div");
      pg.className = "sheet sheet-ak";
      pg.innerHTML = (pages.length ? '<div class="ak-cont">' + esc(c.title) + "（續）</div>" : header) +
        '<div class="ak-body">' + colHead + "</div>" + '<div class="ak-foot"></div>';
      stage.appendChild(pg);
      pages.push(pg);
      return $(".ak-body", pg);
    }
    var body = newPage();
    rows.forEach(function (row) {
      body.appendChild(row);
      if (body.scrollHeight > body.clientHeight + 1 && body.children.length > 2) {
        body.removeChild(row);
        body = newPage();
        body.appendChild(row);
      }
    });
    pages.forEach(function (pg, i) {
      $(".ak-foot", pg).textContent = CFG.category + "｜課程講師 " + CFG.instructor + "｜第 " + (i + 1) + " / " + pages.length + " 頁";
    });
  }

  // html2canvas 偶爾在 iframe 內（如 Google Sites）等不到複製頁面載入而停住，逾時則重試
  function capture(sheet, tries) {
    var timer;
    var attempt = window.html2canvas(sheet, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    var limit = new Promise(function (res, rej) { timer = setTimeout(function () { rej(new Error("capture timeout")); }, 8000); });
    return Promise.race([attempt, limit]).then(function (canvas) {
      clearTimeout(timer);
      return canvas;
    }, function (err) {
      clearTimeout(timer);
      if (tries > 1) return capture(sheet, tries - 1);
      throw err;
    });
  }

  function downloadPdf() {
    var btn = $("#btn-pdf");
    var status = $("#pdf-status");
    if (!window.html2canvas || !window.jspdf) {
      status.textContent = "PDF 元件載入失敗，請改用「列印／另存 PDF」。";
      return;
    }
    btn.disabled = true;
    status.textContent = "正在產生 PDF，請稍候…";
    var sheets = $all("#render-stage .sheet");
    var stage = $("#render-stage");
    stage.classList.add("capturing");
    var jsPDF = window.jspdf.jsPDF;
    var pdf = null;

    // 字型或圖片載入受阻（如公司網路擋 Google Fonts、嵌入 iframe）時，最多等 4 秒即繼續產生
    var timeout = new Promise(function (res) { setTimeout(res, 4000); });
    var fontsReady = Promise.race([document.fonts && document.fonts.ready ? document.fonts.ready : null, timeout]);
    var imgsReady = Promise.all($all("#render-stage img").map(function (img) {
      return img.complete ? null : new Promise(function (res) { img.onload = img.onerror = res; });
    })).then(null, null);
    imgsReady = Promise.race([imgsReady, timeout]);
    Promise.all([fontsReady, imgsReady]).then(function () {
      return sheets.reduce(function (chain, sheet) {
        return chain.then(function () {
          return capture(sheet, 3)
            .then(function (canvas) {
              var landscape = sheet.classList.contains("sheet-cert");
              var w = landscape ? 297 : 210, h = landscape ? 210 : 297;
              var orient = landscape ? "landscape" : "portrait";
              if (!pdf) pdf = new jsPDF({ orientation: orient, unit: "mm", format: "a4" });
              else pdf.addPage("a4", orient);
              pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
            });
        });
      }, Promise.resolve());
    }).then(function () {
      var r = state.result, p = state.profile;
      pdf.setProperties({ title: "結業證書 " + state.course.title + " " + p.name, subject: CFG.category, author: CFG.instructor });
      var name = ("結業證書_" + state.course.title + "_" + p.name + "_" + r.certNo).replace(/[\\/:*?"<>|\s]+/g, "_") + ".pdf";
      var url = URL.createObjectURL(pdf.output("blob"));
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 保留連結供下載被封鎖時（如嵌入 Google Sites）改由新分頁開啟
      var link = $("#pdf-link");
      if (link.dataset.url) URL.revokeObjectURL(link.dataset.url);
      link.dataset.url = url;
      $("a", link).href = url;
      link.hidden = false;
      status.textContent = FRAMED ? "PDF 已產生。" : "PDF 已產生並開始下載。";
    }).catch(function (err) {
      console.error(err);
      status.textContent = FRAMED ? "PDF 產生失敗，請在新視窗開啟本網站後再試。" : "PDF 產生失敗，請改用「列印／另存 PDF」。";
    }).then(function () {
      stage.classList.remove("capturing");
      btn.disabled = false;
    });
  }

  // ---------- 事件 ----------
  document.addEventListener("click", function (e) {
    var nav = e.target.closest("[data-nav]");
    if (nav) {
      e.preventDefault();
      var go = function () { renderHome(); show(nav.getAttribute("data-nav")); };
      if (nav.closest("#view-quiz")) {
        confirmDialog("確定放棄本次測驗？作答內容將不會保存。", "放棄測驗").then(function (ok) { if (ok) go(); });
      } else go();
      return;
    }
    var cb = e.target.closest("[data-course]");
    if (cb) startCourse(cb.getAttribute("data-course"));
  });
  $("#info-form").addEventListener("submit", onInfoSubmit);
  $("#quiz-form").addEventListener("submit", onQuizSubmit);
  $("#quiz-form").addEventListener("change", function (e) {
    var fs = e.target.closest(".q");
    if (fs) fs.classList.remove("missing");
    updateProgress();
  });

  if (FRAMED) {
    var fl = $("#frame-link");
    fl.hidden = false;
    $("a", fl).href = window.location.href.split("#")[0];
  }
  fillStatic();
  renderHome();
  show("home");
})();
