/**
 * ISMS 課後測驗紀錄 — Google Apps Script（選用）
 *
 * 用途：將每次測驗結果（含通過／未通過）寫入 Google 試算表，作為教育訓練紀錄。
 * 部署方式請見 README.md「測驗紀錄（選用）」。
 */
var SHEET_NAME = "測驗紀錄";
var HEADERS = [
  "測驗時間", "課程代碼", "課程名稱", "課程時數", "教育訓練類別", "課程講師",
  "公司名稱", "單位", "姓名", "職稱", "E-mail", "實際上課日期", "參加方式",
  "成績", "結果", "證書編號", "作答內容"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
    sh.appendRow([
      new Date(d.timestamp), d.courseId, d.courseTitle, d.hours, d.category, d.instructor,
      clean(d.company), clean(d.dept), clean(d.name), clean(d.jobTitle), clean(d.email), clean(d.classDate), clean(d.mode),
      Number(d.score), d.passed ? "通過" : "未通過", d.certNo || "", d.answers
    ]);
    return ContentService.createTextOutput("ok");
  } finally {
    lock.releaseLock();
  }
}

// 避免試算表公式注入（CSV/Formula Injection）
function clean(v) {
  v = String(v == null ? "" : v).slice(0, 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
