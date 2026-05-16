"use strict";

(function initSgfTools(globalObject) {
	const MANAGED_KEYS = ["PB", "BR", "PW", "WR", "EV", "RO"];

	function findRootRange(sgf) {
		const rootStart = sgf.indexOf("(;");
		if (rootStart === -1) {
			throw new Error("Could not find SGF root node.");
		}

		const contentStart = rootStart + 2;
		let inValue = false;
		let escaped = false;

		for (let index = contentStart; index < sgf.length; index += 1) {
			const ch = sgf[index];

			if (inValue) {
				if (escaped) {
					escaped = false;
				} else if (ch === "\\") {
					escaped = true;
				} else if (ch === "]") {
					inValue = false;
				}
			} else if (ch === "[") {
				inValue = true;
			} else if (ch === ";" || ch === "(" || ch === ")") {
				return {
					rootStart,
					contentStart,
					contentEnd: index,
					segment: sgf.slice(contentStart, index)
				};
			}
		}

		return {
			rootStart,
			contentStart,
			contentEnd: sgf.length,
			segment: sgf.slice(contentStart)
		};
	}

	function decodeValue(raw) {
		let output = "";
		let escaped = false;

		for (const ch of raw) {
			if (escaped) {
				output += ch;
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else {
				output += ch;
			}
		}

		if (escaped) {
			output += "\\";
		}

		return output;
	}

	function escapeValue(value) {
		return String(value)
			.replaceAll("\\", "\\\\")
			.replaceAll("]", "\\]")
			.replaceAll("\r\n", "\n")
			.replaceAll("\r", "\n");
	}

	function parseRootTokens(segment) {
		const tokens = [];
		let index = 0;

		while (index < segment.length) {
			while (index < segment.length && /\s/.test(segment[index])) {
				index += 1;
			}

			const start = index;
			while (index < segment.length && /[A-Za-z]/.test(segment[index])) {
				index += 1;
			}

			if (index === start) {
				index += 1;
				continue;
			}

			const key = segment.slice(start, index).toUpperCase();
			const values = [];
			let end = index;

			while (index < segment.length) {
				while (index < segment.length && /\s/.test(segment[index])) {
					index += 1;
				}

				if (segment[index] !== "[") {
					break;
				}

				index += 1;
				const valueStart = index;
				let escaped = false;

				while (index < segment.length) {
					const ch = segment[index];
					if (escaped) {
						escaped = false;
					} else if (ch === "\\") {
						escaped = true;
					} else if (ch === "]") {
						break;
					}
					index += 1;
				}

				values.push(decodeValue(segment.slice(valueStart, index)));

				if (segment[index] === "]") {
					index += 1;
				}
				end = index;
			}

			if (values.length > 0) {
				tokens.push({ key, values, start, end });
			}
		}

		return tokens;
	}

	function extractRootProperties(sgf) {
		const range = findRootRange(sgf);
		const props = {};

		for (const token of parseRootTokens(range.segment)) {
			if (!Object.hasOwn(props, token.key)) {
				props[token.key] = [];
			}
			props[token.key].push(...token.values);
		}

		return props;
	}

	function applyMetadata(sgf, fields, options) {
		const range = findRootRange(sgf);
		const tokens = parseRootTokens(range.segment);
		const removeKeys = new Set((options?.removeKeys || []).map((key) => key.toUpperCase()));
		const updates = {};

		for (const key of MANAGED_KEYS) {
			if (Object.hasOwn(fields, key)) {
				updates[key] = String(fields[key] || "").trim();
			}
		}

		const emitted = new Set();
		let cursor = 0;
		let segment = "";

		for (const token of tokens) {
			segment += range.segment.slice(cursor, token.start);
			cursor = token.end;

			if (removeKeys.has(token.key)) {
				continue;
			}

			if (Object.hasOwn(updates, token.key)) {
				if (!emitted.has(token.key) && updates[token.key]) {
					segment += `${token.key}[${escapeValue(updates[token.key])}]`;
					emitted.add(token.key);
				}
				continue;
			}

			segment += range.segment.slice(token.start, token.end);
		}

		segment += range.segment.slice(cursor);

		for (const key of MANAGED_KEYS) {
			if (Object.hasOwn(updates, key) && updates[key] && !emitted.has(key)) {
				segment += `${key}[${escapeValue(updates[key])}]`;
			}
		}

		return sgf.slice(0, range.contentStart) + segment + sgf.slice(range.contentEnd);
	}

	function firstProp(sgf, key) {
		try {
			const values = extractRootProperties(sgf)[key];
			return values && values.length > 0 ? values[0] : "";
		} catch {
			return "";
		}
	}

	function cleanFilenamePart(value) {
		return String(value || "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
			.slice(0, 80);
	}

	function buildFilename(sgf) {
		const parts = ["kifu"];
		const dt = firstProp(sgf, "DT").replaceAll("-", "");
		const pb = cleanFilenamePart(firstProp(sgf, "PB"));
		const pw = cleanFilenamePart(firstProp(sgf, "PW"));

		if (dt) parts.push(dt);
		if (pb) parts.push(pb);
		if (pw) parts.push(pw);

		return `${parts.join("_")}.sgf`;
	}

	const api = {
		MANAGED_KEYS,
		applyMetadata,
		buildFilename,
		extractRootProperties,
		parseRootTokens
	};

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	} else {
		globalObject.SgfTools = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : window);
