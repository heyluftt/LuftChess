// Läuft beim Laden jeder Chess.com-Seite. Blendet Werbeflächen aus, wenn die Option an ist.
// Der Schalter liegt im localStorage von chess.com und wird von der App gesetzt.
(function () {
  if (!/(^|\.)chess\.com$/.test(location.hostname)) return;
  var ID = "luftchess-ads";
  var CSS =
    "#board-layout-ad, #sidebar-ad, .skyscraper-ad-component, .ad-upgrade-link-monetization-button," +
    " ins.adsbygoogle, iframe[id^='google_ads_iframe'] { display: none !important; }";
  function apply() {
    try {
      var on = localStorage.getItem(ID) === "1";
      var el = document.getElementById(ID);
      if (on && !el) {
        el = document.createElement("style");
        el.id = ID;
        el.textContent = CSS;
        (document.head || document.documentElement).appendChild(el);
      } else if (!on && el) {
        el.remove();
      }
    } catch (e) {}
  }
  window.__luftchessAds = function (on) {
    try {
      localStorage.setItem(ID, on ? "1" : "0");
    } catch (e) {}
    apply();
  };
  if (document.documentElement) apply();
  else document.addEventListener("DOMContentLoaded", apply);
})();
