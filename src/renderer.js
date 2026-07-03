"use strict";

const fields = Array.from(document.querySelectorAll("#metadata-form input"));
const fieldByName = Object.fromEntries(fields.map((field) => [field.name, field]));

const elements = {
	apiKey: document.querySelector("#api-key"),
	clear: document.querySelector("#clear"),
	copyOutput: document.querySelector("#copy-output"),
	filename: document.querySelector("#filename"),
	keySource: document.querySelector("#key-source"),
	model: document.querySelector("#model"),
	notes: document.querySelector("#notes"),
	saveOutput: document.querySelector("#save-output"),
	sgfInput: document.querySelector("#sgf-input"),
	sourceProps: document.querySelector("#source-props"),
	status: document.querySelector("#status"),
	translate: document.querySelector("#translate")
};

let currentOutput = "";

function setStatus(message, kind) {
	elements.status.textContent = message;
	elements.status.title = message;
	elements.status.dataset.kind = kind || "";
	delete elements.status.dataset.source;
}

function setErrorStatus(action, error) {
	const message = error?.message || String(error);
	console.error(`${action} failed:`, error);
	setStatus(`${action} failed. See console for details.`, "error");
	elements.status.title = message;
}

function collectFields() {
	return Object.fromEntries(fields.map((field) => [field.name, field.value]));
}

function setFields(values) {
	for (const key of SgfTools.MANAGED_KEYS) {
		fieldByName[key].value = values[key] || "";
	}
}

function renderSourceProps() {
	const sgf = elements.sgfInput.value;
	elements.sourceProps.textContent = "";

	if (!sgf.trim()) {
		elements.sourceProps.innerHTML = '<span class="empty">No SGF loaded</span>';
		return;
	}

	try {
		const props = SgfTools.extractRootProperties(sgf);
		const entries = Object.entries(props);
		if (entries.length === 0) {
			elements.sourceProps.innerHTML = '<span class="empty">No root properties found</span>';
			return;
		}

		for (const [key, values] of entries) {
			const item = document.createElement("div");
			item.className = "prop-item";

			const keyNode = document.createElement("strong");
			keyNode.textContent = key;

			const valueNode = document.createElement("span");
			valueNode.textContent = values.join(", ");

			item.append(keyNode, valueNode);
			elements.sourceProps.append(item);
		}
	} catch (error) {
		elements.sourceProps.innerHTML = `<span class="empty">${error.message}</span>`;
	}
}

function updateOutput() {
	const sgf = elements.sgfInput.value;
	if (!sgf.trim()) {
		currentOutput = "";
		elements.filename.textContent = "kifu.sgf";
		if (elements.status.dataset.source === "sgf") {
			setStatus("Ready", "");
		}
		return;
	}

	try {
		currentOutput = SgfTools.applyMetadata(sgf, collectFields(), { removeKeys: ["GN"] });
		elements.filename.textContent = SgfTools.buildFilename(currentOutput);
		if (elements.status.dataset.source === "sgf") {
			setStatus("Ready", "");
		}
	} catch (error) {
		currentOutput = "";
		elements.filename.textContent = "kifu.sgf";
		setStatus(error.message, "error");
		elements.status.dataset.source = "sgf";
	}
}

function resetFields() {
	setFields({});
	elements.notes.value = "";
	updateOutput();
}

async function loadDefaults() {
	const defaults = await window.kifudepot.getDefaults();
	elements.model.value = defaults.model || "claude-opus-4-6";
	elements.keySource.textContent = defaults.keySource ? `Using ${defaults.keySource} when API key is blank` : "";
}

async function translate() {
	const sgf = elements.sgfInput.value;

	elements.translate.disabled = true;
	setStatus("Translating...", "busy");

	try {
		const result = await window.kifudepot.translateSgf({
			sgf,
			apiKey: elements.apiKey.value,
			model: elements.model.value
		});

		const parsed = result.parsed || {};
		setFields(parsed);
		elements.notes.value = parsed.C || "";
		renderSourceProps();
		updateOutput();
		setStatus("Translation complete", "ok");
	} catch (error) {
		setErrorStatus("Translation", error);
	} finally {
		elements.translate.disabled = false;
	}
}

async function saveOutput() {
	try {
		const result = await window.kifudepot.saveSgf({
			output: currentOutput
		});

		if (!result.canceled) {
			setStatus(`Saved ${result.fileName || "SGF"}`, "ok");
		}
	} catch (error) {
		setErrorStatus("Save", error);
	}
}

async function copyOutput() {
	if (!currentOutput) {
		return;
	}

	await navigator.clipboard.writeText(currentOutput);
	setStatus("Output copied", "ok");
}

elements.translate.addEventListener("click", translate);
elements.saveOutput.addEventListener("click", saveOutput);
elements.copyOutput.addEventListener("click", copyOutput);
elements.clear.addEventListener("click", () => {
	elements.sgfInput.value = "";
	resetFields();
	renderSourceProps();
	setStatus("Ready", "");
});

elements.sgfInput.addEventListener("input", () => {
	renderSourceProps();
	resetFields();
});

for (const field of fields) {
	field.addEventListener("input", updateOutput);
}

loadDefaults().catch((error) => {
	setErrorStatus("Loading defaults", error);
});
renderSourceProps();
updateOutput();
