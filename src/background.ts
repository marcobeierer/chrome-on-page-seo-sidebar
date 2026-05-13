import { extensionApi } from "./extensionApi";

type SidebarActionApi = {
  toggle?: () => Promise<void>;
  open?: () => Promise<void>;
};

type BrowserSpecificApi = typeof chrome & {
  sidebarAction?: SidebarActionApi;
};

const api = extensionApi as BrowserSpecificApi;

extensionApi.runtime.onInstalled.addListener(() => {
  void configureSidebarBehavior();
});

extensionApi.runtime.onStartup.addListener(() => {
  void configureSidebarBehavior();
});

extensionApi.action.onClicked.addListener(() => {
  void openFirefoxSidebar();
});

async function configureSidebarBehavior(): Promise<void> {
  if (api.sidePanel !== undefined) {
    await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}

async function openFirefoxSidebar(): Promise<void> {
  if (api.sidePanel !== undefined || api.sidebarAction === undefined) {
    return;
  }
  if (api.sidebarAction.toggle !== undefined) {
    await api.sidebarAction.toggle();
    return;
  }
  await api.sidebarAction.open?.();
}
