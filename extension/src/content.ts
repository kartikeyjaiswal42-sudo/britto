// The extension's content script: the shared page reader (reader.ts) with the service worker
// as its only way to the server (chrome.runtime messages, BLUEPRINT §7.5).
import { savePageAsFile } from './panel.ts';
import { startReader } from './reader.ts';

startReader({ send: (msg) => chrome.runtime.sendMessage(msg), device: 'desktop', savePage: savePageAsFile });
