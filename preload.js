"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kifudepot", {
	getDefaults: () => ipcRenderer.invoke("app:get-defaults"),
	translateSgf: (payload) => ipcRenderer.invoke("claude:translate-sgf", payload),
	saveSgf: (payload) => ipcRenderer.invoke("sgf:save", payload)
});
