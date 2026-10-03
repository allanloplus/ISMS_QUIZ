/**
 * 網站設定
 */
window.QUIZ_CONFIG = {
  siteTitle: "ISMS 課程課後測驗",
  category: "ISMS專業課程教育訓練",
  instructor: "羅宇倫 Allan Lo",
  // 講師簽名圖檔（透明背景 PNG），留空則不顯示
  signature: "img/signature.png",
  // 及格分數（滿分 100）
  passScore: 70,
  // 證書編號前綴
  certPrefix: "ISMS",
  // 選用：測驗紀錄回傳網址（Google Apps Script Web App URL，見 apps-script/Code.gs）
  // 留空則不回傳，僅於受測者瀏覽器內產生證書。
  recordEndpoint: ""
};
