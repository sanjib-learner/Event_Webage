// Minimal service worker for Manifest V3.
// Kept for future extension points (telemetry, settings sync, etc.).
chrome.runtime.onInstalled.addListener(() => {
  // Extension installed/updated.
  console.log('Reflect Before Send installed.');
});
