import type { ExtractedPageData } from "../analyzer/types";
import { inspectedPageAnalysis } from "../inspectedPage";

let lastActiveTabId: number | null = null;

export function rememberActiveTabId(tabId: number): void {
  lastActiveTabId = tabId;
}

export function isRememberedActiveTab(tabId: number): boolean {
  return tabId === lastActiveTabId;
}

export function evaluateActiveTabPage(canRequestAccess: boolean): Promise<ExtractedPageData> {
  return evaluateActiveTabFunction(inspectedPageAnalysis, canRequestAccess);
}

export async function evaluateActiveTabFunction<T>(func: () => T, canRequestAccess = false): Promise<T> {
  const tab = await getActiveTab();
  if (tab.id === undefined) {
    throw new Error("No active tab is available for analysis.");
  }
  if (isRestrictedUrl(tab.url)) {
    throw new Error("Chrome does not allow extensions to analyze this page. Open a normal website, staging page, or localhost URL.");
  }

  rememberActiveTabId(tab.id);
  if (canRequestAccess) {
    const granted = await requestTabAccess(tab.url);
    if (!granted) {
      throw new Error(missingTabAccessMessage(tab.url));
    }
  }

  try {
    return await executeActiveTabFunction(tab.id, func);
  } catch (error) {
    if (!isMissingHostPermissionError(error)) {
      throw error;
    }
    throw new Error(missingTabAccessMessage(tab.url));
  }
}

async function executeActiveTabFunction<T>(tabId: number, func: () => T): Promise<T> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
  });

  if (result === undefined) {
    throw new Error("The page did not return analysis data.");
  }
  return result.result as T;
}

async function requestTabAccess(url: string | undefined): Promise<boolean> {
  const origin = permissionOrigin(url);
  if (origin === undefined) {
    return false;
  }
  return chrome.permissions.request({ origins: [origin] });
}

function permissionOrigin(url: string | undefined): string | undefined {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return undefined;
  }
}

function isMissingHostPermissionError(error: unknown): boolean {
  return error instanceof Error && /must request permission to access this host/i.test(error.message);
}

function missingTabAccessMessage(url: string | undefined): string {
  const origin = pageOrigin(url);
  return `Chrome has not granted access to ${origin}. Click Refresh and allow site access to analyze this page.`;
}

function pageOrigin(url: string | undefined): string {
  try {
    return new URL(url ?? "").origin;
  } catch {
    return "this page";
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab === undefined) {
    throw new Error("No active tab found. Select a page and reopen the sidebar.");
  }
  return tab;
}

function isRestrictedUrl(url: string | undefined): boolean {
  return url !== undefined && /^(chrome|chrome-extension|edge|about):/i.test(url);
}
