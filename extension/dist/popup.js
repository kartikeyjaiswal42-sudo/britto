"use strict";
(() => {
  // extension/src/popup.ts
  var site = document.getElementById("site");
  site.href = "https://britto.amitynoidalibrary.workers.dev";
  document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
})();
