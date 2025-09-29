/*** data ***/

const HOST_NAME = 'io.github.tcode2k16.rofi.chrome';

let state = {
  port: null,
  lastTabId: [0, 0],
};

/*** utils ***/

function goToTab(id) {
  chrome.tabs.get(id, function (tabInfo) {
    chrome.windows.update(tabInfo.windowId, { focused: true }, function () {
      chrome.tabs.update(id, { active: true, highlighted: true });
    });
  });
}

function openUrlInNewTab(url) {
  chrome.tabs.create({ url });
}

function refreshHistory(callback) {
  chrome.history.search({
    text: '',
    startTime: 0,
    maxResults: 2147483647,
  }, function (results) {
    callback(results);
  });
}

/*** commands ***/

const CMDS = {
  switchTab() {
    chrome.tabs.query({}, function (tabs) {
      state.port.postMessage({
        'info': 'switchTab',
        'rofi_flags': ['-i', '-p', 'tab'],
        'choices': tabs.map(e => (e.id) + ': ' + e.title + ' ::: ' + e.url),
      });
    });
  },

  openHistory() {
    refreshHistory(function (results) {
      state.port.postMessage({
        'info': 'openHistory',
        'rofi_flags': ['-matching', 'normal', '-i', '-p', 'history'],
        'choices': results.map(e => e.title + ' ::: ' + e.url),
      });
    });
  },
  
  goLastTab() {
    goToTab(state.lastTabId[1]);
  },

  pageFunc() {
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabInfo) {
      if (tabInfo.length < 1) return;
      const pageOrigin = (new URL(tabInfo[0].url)).origin;

      refreshHistory(function (results) {
        state.port.postMessage({
          'info': 'changeToPage',
          'rofi_flags': ['-matching', 'normal', '-i', '-p', 'page'],
          'choices': results.filter(e => e.url.indexOf(pageOrigin) === 0).map(e => e.title + ' ::: ' + e.url),
        });
      });
    });
  },
};

/*** listeners ***/

function onNativeMessage(message) {
  console.log({ message });
  if (message.info === 'switchTab' && message.result !== '') {
    goToTab(parseInt(message.result.split(': ')[0]));
  } else if (message.info === 'openHistory' && message.result !== '') {
    let parts = message.result.split(' ::: ');

    openUrlInNewTab(parts[parts.length - 1]);
  } else if (message.info === 'changeToPage' && message.result !== '') {
    let parts = message.result.split(' ::: ');
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabInfo) {
      chrome.tabs.update(tabInfo[0].id, {
        url: parts[parts.length - 1],
      });
    });
  } else if (message.result === '') {
    // do nothing
  } else {
    // Use notification instead of alert
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png', // Add a valid icon to your extension directory
      title: 'rofi-chrome',
      message: JSON.stringify(message),
    });
  }
}

function onDisconnected() {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'rofi-chrome',
    message: "Failed to connect: " + chrome.runtime.lastError.message,
  });
  state.port = null;
}

function addChromeListeners() {
  chrome.commands.onCommand.addListener(command => {
    if (command in CMDS) {
      CMDS[command]();
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'rofi-chrome',
        message: 'unknown command: ' + command,
      });
    }
  });

  chrome.tabs.onActivated.addListener(activeInfo => {
    state.lastTabId[1] = state.lastTabId[0];
    state.lastTabId[0] = activeInfo.tabId;
  });
}

/*** main ***/

function main() {
  state.port = chrome.runtime.connectNative(HOST_NAME);
  state.port.onMessage.addListener(onNativeMessage);
  state.port.onDisconnect.addListener(onDisconnected);

  addChromeListeners();
};

main();

