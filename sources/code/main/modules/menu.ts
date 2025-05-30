/*
 * menus – OS native menus (tray menu, context menu, menu bar etc.)
 */
import { app, Menu, Tray } from "electron/main";
import { shell, clipboard } from "electron/common";

import {
  getBuildInfo,
  appInfo
} from "../../common/modules/client";

import { appConfig } from "./config";
import { EventEmitter } from "events";
import { createGithubIssue } from "./bug";
import L10N from "../../common/modules/l10n";
import loadSettingsWindow from "../windows/settings";
import loadDocsWindow from "../windows/docs";
import showAboutPanel from "../windows/about";
import { commonCatches } from "./error";

const sideBar = new EventEmitter();
const devel = getBuildInfo().type === "devel";

sideBar.on("hide", (contents: Electron.WebContents) => {
  console.debug("[EVENT] Hiding menu bar...");
  contents.insertCSS([
    // Make left sidebar hidden
    "div[class^=sidebar_],div[class^=sidebarList_]{ width: 0px !important; }",
    // Make settings sidebar hidden
    "div[class^=sidebarRegion_]{ display: none !important; }",
    // Make settings content fit entire available space.
    "div[class^=contentColumn_]{ max-width: 100% !important; }"
  ].join("\n"),{cssOrigin:"author"}).then(cssKey => {
    sideBar.once("show", () => {
      console.debug(`[EVENT] Showing menu bar (${cssKey})...`);
      void contents.removeInsertedCSS(cssKey);
    });
  }).catch(commonCatches.print);
});

// Contex Menu with spell checker

export function context(parent: Electron.BrowserWindow): void {
  const { context } = new L10N().client;
  parent.webContents.on("context-menu", (_event, params) => Menu.buildFromTemplate([
    { type: "separator" },
    // Dictionary suggestions
    ...(params.dictionarySuggestions.map(suggestion => ({
      label: suggestion,
      click: () => parent.webContents.replaceMisspelling(suggestion)
    } satisfies Electron.MenuItemConstructorOptions))),
    // Add to dictionary
    ...(params.misspelledWord !== "" ? [
      { type: "separator" },
      {
        label: context.dictionaryAdd,
        click: () => parent.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      },
      { type: "separator" }
    ] satisfies Electron.MenuItemConstructorOptions[] : []),
    // Copy / Cut / Delete
    ...(params.editFlags.canCopy || params.editFlags.canCut || params.editFlags.canDelete ? [
      { label: context.cut, role: "cut", enabled: params.editFlags.canCut },
      { label: context.copy, role: "copy", enabled: params.editFlags.canCopy },
      {
        label: context.paste,
        enabled: clipboard.availableFormats().length !== 0 && params.editFlags.canPaste,
        role: "paste"
      },
      {
        label: context.googleSearch,
        enabled: params.editFlags.canCopy,
        click: () => {
          shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`).catch(commonCatches.throw);
        }
      },
      { type: "separator" }
    ] satisfies Electron.MenuItemConstructorOptions[] : []),
    // Copy link text / copy link url
    ...(params.linkURL !== "" ? [
      {
        label: context.copyURL,
        click: () => clipboard.writeText(params.linkURL)
      },
      ...(params.linkText !== "" ? [{
        label: context.copyURLText,
        click: () => clipboard.writeText(params.linkText)
      }] : []),
      { type: "separator" }
    ] satisfies Electron.MenuItemConstructorOptions[] : []),
    // Copy image / image link
    ...(params.mediaType === "image" ? [
      {
        label: context.copyImage,
        click: () => parent.webContents.copyImageAt(params.x,params.y)
      },
      {
        label: context.copyImageURL,
        click: () => clipboard.writeText(params.srcURL)
      },
      { type: "separator" }
    ] satisfies Electron.MenuItemConstructorOptions[] : []),
    // Inspect (DevTools)
    ...(devel || appConfig.value.settings.advanced.devel.enabled ? [{
      label: context.inspectElement,
      click: () => parent.webContents.inspectElement(params.x, params.y)
    }] : [])
  ]).popup({
    window: parent,
    x: params.x,
    y: params.y
  }));
}

// Tray menu

export function tray(parent: Electron.BrowserWindow): Electron.Tray {
  const strings = new L10N().client;
  const {icons} = appInfo;
  const tray = new Tray(icons.tray.default);
  function toggleVisibility() {
    if(parent.isVisible() && parent.isFocused()) {
      parent.hide();
    } else if (!parent.isVisible()) {
      parent.show();
    } else {
      parent.focus();
    }
  }
  const contextMenu = Menu.buildFromTemplate([
    {
      label: app.getName(),
      icon: icons.tray.default.resize({height: 16}),
      enabled: false
    },
    { type: "separator" },
    ...(process.platform !== "win32" ? [{
      label: strings.tray.toggle,
      click: () => setImmediate(toggleVisibility)
    }] : []),
    {
      label: strings.help.bugs,
      click: () => void createGithubIssue().catch(commonCatches.throw)
    },
    {
      label: strings.windows.about,
      click: () => showAboutPanel(parent)
    },
    {
      label: strings.windows.docs,
      click: () => void loadDocsWindow(parent).catch(commonCatches.throw)
    },
    { type: "separator" },
    ...(process.platform === "win32" ? [{
      label: strings.tray.toggle,
      click: () => setImmediate(toggleVisibility)
    }] : []),
    {
      label: strings.tray.quit,
      click: () => app.quit()
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(app.getName());
  tray.on("click", toggleVisibility);
  // Exit to the tray
  {
    let willQuit = false;
    app.once("before-quit", () => willQuit = true);
    parent.on("close", (event) => {
      if (!willQuit && appConfig.value.settings.general.window.hideOnClose) {
        event.preventDefault();
        parent.hide();
      }
    });
  }
  return tray;
}

// Menu Bar

export function bar(repoLink: string, parent: Electron.BrowserWindow): Electron.Menu {
  const strings = new L10N().client;
  const webLink = repoLink.substring(repoLink.indexOf("+") + 1);
  const menu = Menu.buildFromTemplate([
    // File
    {
      label: strings.menubar.file.groupName, submenu: [
        // Settings
        {
          label: strings.windows.settings,
          click: () => loadSettingsWindow(parent)
        },
        // Extensions (Work In Progress state)
        /*{
					label: strings.menubar.file.addon.groupName,
					visible: devel || appConfig.value.devel,
					//click: () => {}
				},*/
        { type: "separator" },
        // Reset
        {
          label: strings.menubar.file.relaunch,
          accelerator: "CmdOrCtrl+Alt+R",
          click: () => {
            const newArgs:string[] = [];
            for (const arg of process.argv) {
              if(!/^--?(?:start-minimized|m)$/.test(arg))
                newArgs.push(arg);
            }
            newArgs.shift();
            app.relaunch({
              args: newArgs,
            });
            app.quit();
          }
        },
        // Quit
        {
          label: strings.menubar.file.quit,
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            app.quit();
          }
        }
      ]
    },
    // Edit
    { role: "editMenu", label: strings.menubar.edit.groupName, submenu: [
      { label: strings.menubar.edit.undo, role: "undo" },
      { label: strings.menubar.edit.redo, role: "redo" },
      { type: "separator" },
      { label: strings.context.cut, role: "cut" },
      { label: strings.context.copy, role: "copy" },
      { label: strings.context.paste, role: "paste" },
      { type: "separator" },
      { label: strings.menubar.edit.selectAll, role: "selectAll" }
    ]},
    // View
    {
      label: strings.menubar.view.groupName, submenu: [
        // Reload
        { label: strings.menubar.view.reload, role: "reload" },
        // Force reload
        { label: strings.menubar.view.forceReload, role: "forceReload" },
        { type: "separator" },
        // DevTools
        {
          label: strings.menubar.view.devTools,
          id: "devTools",
          role: "toggleDevTools",
          enabled: devel || appConfig.value.settings.advanced.devel.enabled
        },
        { type: "separator" },
        // Zoom settings (reset, zoom in, zoom out)
        { label: strings.menubar.view.resetZoom, role: "resetZoom" },
        { label: strings.menubar.view.zoomIn, role: "zoomIn" },
        { label: strings.menubar.view.zoomOut, role: "zoomOut" },
        { type: "separator" },
        // Toggle full screen
        { label: strings.menubar.view.fullScreen, role: "togglefullscreen" }
      ]
    },
    // Window
    {
      label: strings.menubar.window.groupName, submenu: [{
        label: strings.menubar.window.mobileMode,
        type: "checkbox",
        accelerator: "CmdOrCtrl+Alt+M",
        checked: false,
        click: () => {
          if ((sideBar.listenerCount("show") + sideBar.listenerCount("hide")) > 1) {
            sideBar.emit("show");
          } else {
            sideBar.emit("hide", parent.webContents);
          }
        }
      }]
    },
    // Help
    {
      label: strings.help.groupName, role: "help", submenu: [
        // About
        { label: strings.windows.about, click: () => showAboutPanel(parent)},
        // Repository
        { label: strings.help.repo, click: () => void shell.openExternal(webLink).catch(commonCatches.throw) },
        // Documentation
        { label: strings.windows.docs, click: () => void loadDocsWindow(parent).catch(commonCatches.throw) },
        // Report a bug
        { label: strings.help.bugs, click: () => void createGithubIssue().catch(commonCatches.throw) }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
  return menu;
}
