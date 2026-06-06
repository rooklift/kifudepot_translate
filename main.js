"use strict";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const SgfTools = require("./src/sgf-tools");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-6";

const SYS_PROMPT = `
Some info was extracted about a go game, from an SGF file.
Would you please translate to English, and output info as JSON.
Note that we require exactly the following keys:

{
	"PB": "name of black",
	"BR": "rank of black",
	"PW": "name of white",
	"WR": "rank of white",
	"EV": "event",
	"RO": "round",
	"C": "any comments / notes from you Claude about translation issues only"
}

Specify ranks using a "p", e.g. "9p", unless it's clearly an amateur.
Note that the input might use other keys. Extract as reasonable.
In particular, a GN input might give info about event and round.

Note that sub-events like "Japanese preliminary" or even "league"
are acceptable as valid rounds (RO field).

If info is missing, use an empty string as the value.

Return only valid JSON. Thank you Claude we love you!
`;

function createWindow() {
	const win = new BrowserWindow({
		width: 1240,
		height: 820,
		minWidth: 920,
		minHeight: 640,
		backgroundColor: "#f6f3ed",
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(__dirname, "preload.js")
		}
	});

	win.loadFile(path.join(__dirname, "src", "index.html"));
}

function readKeyFromFile() {
	for (const keyPath of getKeyPaths()) {
		try {
			const key = fs.readFileSync(keyPath, "utf8").trim();
			if (key) return key;
		} catch {
			// Try the next configured key location.
		}
	}

	return "";
}

function resolveApiKey(provided) {
	const trimmed = String(provided || "").trim();
	if (trimmed) return trimmed;
	if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
	return readKeyFromFile();
}

function getKeySource() {
	if (process.env.ANTHROPIC_API_KEY) return "ANTHROPIC_API_KEY";
	for (const keyPath of getKeyPaths()) {
		try {
			if (fs.readFileSync(keyPath, "utf8").trim()) {
				return path.relative(__dirname, keyPath);
			}
		} catch {
			// Try the next configured key location.
		}
	}
	return "";
}

function getKeyPaths() {
	return [
		path.join(__dirname, "keys", "anthropic.txt"),
		// Could add other locations to try
	];
}

function buildClaudeMessage(sgf) {
	const props = SgfTools.extractRootProperties(sgf);
	const lines = ["The SGF root contained the following info:"];

	for (const [key, values] of Object.entries(props)) {
		lines.push(`${key}: ${values.join(", ")}`);
	}

	return { message: lines.join("\n"), props };
}

function extractJson(text) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	const jsonText = start !== -1 && end !== -1 && start <= end
		? text.slice(start, end + 1)
		: text;

	return JSON.parse(jsonText);
}

async function translateSgf(_event, payload) {
	const sgf = String(payload?.sgf || "");
	const apiKey = resolveApiKey(payload?.apiKey);
	const model = String(payload?.model || DEFAULT_MODEL).trim();

	if (!sgf.trim()) {
		throw new Error("Paste SGF before translating.");
	}
	if (!apiKey) {
		throw new Error("Missing Anthropic API key. Enter one, set ANTHROPIC_API_KEY, or create keys/anthropic.txt.");
	}
	if (!model) {
		throw new Error("Model is required.");
	}

	const { message, props } = buildClaudeMessage(sgf);
	const response = await fetch(ANTHROPIC_URL, {
		method: "POST",
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": ANTHROPIC_VERSION,
			"content-type": "application/json"
		},
		body: JSON.stringify({
			model,
			max_tokens: 1000,
			temperature: 0,
			system: SYS_PROMPT.trim(),
			messages: [
				{ role: "user", content: message }
			]
		})
	});

	const responseText = await response.text();
	if (!response.ok) {
		throw new Error(`Anthropic request failed (${response.status}): ${responseText.slice(0, 800)}`);
	}

	const data = JSON.parse(responseText);
	const text = Array.isArray(data.content)
		? data.content.filter((block) => block.type === "text").map((block) => block.text).join("\n")
		: "";

	if (!text.trim()) {
		throw new Error("Claude returned no text content.");
	}

	return {
		parsed: extractJson(text),
		rawText: text,
		sourceProps: props
	};
}

async function saveSgf(_event, payload) {
	const output = String(payload?.output || "");

	if (!output.trim()) {
		throw new Error("No SGF output to save.");
	}

	const defaultPath = SgfTools.buildFilename(output);

	const result = await dialog.showSaveDialog({
		title: "Save translated SGF",
		defaultPath,
		filters: [
			{ name: "Smart Game Format", extensions: ["sgf"] },
			{ name: "All Files", extensions: ["*"] }
		]
	});

	if (result.canceled || !result.filePath) {
		return { canceled: true };
	}

	fs.writeFileSync(result.filePath, output, "utf8");
	return {
		canceled: false,
		filePath: result.filePath,
		fileName: path.basename(result.filePath)
	};
}

app.whenReady().then(() => {
	ipcMain.handle("app:get-defaults", () => ({
		model: DEFAULT_MODEL,
		keySource: getKeySource()
	}));
	ipcMain.handle("claude:translate-sgf", translateSgf);
	ipcMain.handle("sgf:save", saveSgf);

	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
