declare const BRITTO_API: string;
const site = document.getElementById('site') as HTMLAnchorElement;
site.href = BRITTO_API;
(document.getElementById('version') as HTMLElement).textContent = `v${chrome.runtime.getManifest().version}`;
