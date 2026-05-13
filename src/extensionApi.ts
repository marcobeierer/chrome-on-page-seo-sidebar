type ExtensionGlobal = typeof globalThis & {
  browser?: typeof chrome;
  chrome?: typeof chrome;
};

const extensionGlobal = globalThis as ExtensionGlobal;

export const extensionApi = getExtensionApi();

export function isFirefoxRuntime(): boolean {
  return extensionApi.runtime.getURL("").startsWith("moz-extension:");
}

function getExtensionApi(): typeof chrome {
  const api = extensionGlobal.browser ?? extensionGlobal.chrome;
  if (api === undefined) {
    throw new Error("No WebExtension API namespace is available.");
  }
  return api;
}
