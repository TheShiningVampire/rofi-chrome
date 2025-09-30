/*** rofi-chrome background (MV3 unified, local Rofi integration) ***/

/*** config ***/
const HOST_NAME = 'io.github.tcode2k16.rofi.chrome';
// const THEME_PATH = '/home/initial/.config/rofi/darkblue.rasi';

/*** state ***/
let port = null;

/*** utils ***/
function ensurePort() {
  if (port) return true;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
    port.onMessage.addListener(onNativeMessage);
    port.onDisconnect.addListener(() => {
      console.warn('Native port disconnected:', chrome.runtime.lastError?.message);
      port = null;
    });
    return true;
  } catch (e) {
    console.warn('connectNative failed:', e);
    port = null;
    return false;
  }
}

function sendToNative(obj) {
  if (!ensurePort()) return false;
  try {
    port.postMessage(obj);
    return true;
  } catch (e) {
    console.warn('postMessage failed (retry once):', e);
    port = null;
    if (!ensurePort()) return false;
    port.postMessage(obj);
    return true;
  }
}

function dumpTabsAndSpawnRofi() {
  chrome.tabs.query({}, (tabs) => {
    const tabsArr = tabs.map(t => ({
      id: t.id,
      windowId: t.windowId,
      title: t.title || "(no title)",
      url: t.url || ""
    }));

    sendToNative({
      info: 'dumpTabsJson',
      path: '/tmp/rofi_chrome_tabs.json',
      json: tabsArr
    });

    // NEW: dump history too (titles + urls)
    chrome.history.search({ text: '', startTime: 0, maxResults: 400 }, (hist) => {
      const histArr = (hist || []).map(h => ({
        title: h.title || "(no title)",
        url: h.url || ""
      }));
      sendToNative({
        info: 'dumpHistoryJson',
        path: '/tmp/rofi_chrome_history.json',
        json: histArr
      });

      // make sure bridge is up (for focusing tabs), then spawn your local rofi
      sendToNative({ info: 'startBridge', socket: '/tmp/rofi_chrome.sock' });
      sendToNative({
        info: 'spawnFullRofi',
        spawn: ['rofi','-show','combi','-config','/home/initial/.config/rofi/config.rasi']
      });
    });
  });
}


// dump tabs as JSON for the Rofi script and start a bridge socket on the host
function dumpTabsAndSpawnRofi() {
  chrome.tabs.query({}, (tabs) => {
    const arr = tabs.map(t => ({
      id: t.id,
      windowId: t.windowId,
      title: t.title || "(no title)",
      url: t.url || ""
    }));

    // write JSON for the rofi script to read
    sendToNative({
      info: 'dumpTabsJson',
      path: '/tmp/rofi_chrome_tabs.json',
      json: arr
    });

    // ask host to open a small UNIX socket so the rofi script can request focus
    sendToNative({ info: 'startBridge', socket: '/tmp/rofi_chrome.sock' });

    // now spawn your local rofi combi with chrome-tabs/history modes
    sendToNative({
      info: 'spawnFullRofi',
      spawn: [
        'rofi',
        '-show','combi',
        '-config','/home/initial/.config/rofi/config.rasi'
      ]
    });
  });
}

// receive focus requests bubbled up by the host
function onNativeMessage(message) {
  if (!message) return;
  const { info, error, tabId, windowId } = message;
  if (error) {
    console.warn('Native host error:', error);
    return;
  }
  if (info === 'focusTab' && Number.isInteger(tabId)) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      chrome.windows.update(windowId ?? tab.windowId, { focused: true }, () => {
        chrome.tabs.update(tabId, { active: true });
      });
    });
  }
}

// hotkey
chrome.commands.onCommand.addListener((command) => {
  if (command === 'rofiUnified') dumpTabsAndSpawnRofi();
});
