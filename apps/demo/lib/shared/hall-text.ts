/**
 * Small, comment-preserving edits of a hall document: set the top-level `id` and `name`, and
 * replace the header comment. Used when a hall is copied or saved as a new hall, so the copy does not
 * keep the id, the name or the description of the hall it came from. Works on YAML text and on JSON
 * text (JSON has no comments, so only the fields change there).
 */
import { parseHallConfig, serializeHallConfig, type HallConfig } from '@cinema-hall/core';

/** The first line of the header comment of every hall the demo writes. */
export const HEADER_PREFIX = '# Cinema Hall Config';

const isJsonText = (text: string): boolean => text.trimStart().startsWith('{');

/**
 * Words a YAML parser reads as something other than text when they are written plain (booleans and
 * null in YAML 1.2, and the YAML 1.1 forms some tools still read that way).
 */
const NON_STRING_WORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n']);

/**
 * A YAML scalar that always reads back as the same text: plain for a slug that starts with a letter
 * and is not a word such as `true` or `null`, double-quoted otherwise (`123` would be a number).
 */
export function yamlScalar(value: string): string {
  return /^[a-z][a-z0-9-]*$/.test(value) && !NON_STRING_WORDS.has(value)
    ? value
    : JSON.stringify(value);
}

/**
 * `id: …` at the indentation of the top-level mapping (column 0 as a rule), with the key plain or
 * quoted (`"id": …`, `'id': …`) and optional space before the colon. Nested keys such as
 * `bands[].id` are indented further and never match.
 */
const keyLine = (key: string, indent: string): RegExp =>
  new RegExp(`^${indent}(?:${key}|"${key}"|'${key}')[ \\t]*:(?:[ \\t]|$)`);

/**
 * The indentation of the top-level block mapping: that of its first line that holds content (not
 * blank, a comment, a directive or the `---` document start). Usually none.
 */
function topIndent(lines: readonly string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('%')) continue;
    if (/^---(?:\s|$)/.test(trimmed)) continue;
    return /^[ \t]*/.exec(line)?.[0] ?? '';
  }
  return '';
}

/** One past the closing quote of the quoted scalar that starts at `start`, or -1 on that line. */
function closingQuote(line: string, start: number): number {
  const quote = line[start];
  for (let i = start + 1; i < line.length; i += 1) {
    const char = line[i];
    if (quote === '"' && char === '\\') i += 1;
    else if (quote === "'" && char === "'" && line[i + 1] === "'") i += 1;
    else if (char === quote) return i + 1;
  }
  return -1;
}

/**
 * How the value of a `key: value` line goes on: `block` for a `|` or `>` block scalar and `quoted`
 * for a quoted scalar that does not close on this line (their further lines are text, even one that
 * starts with `#`), `plain` otherwise (a comment line ends the value).
 */
function valueStyle(line: string): 'block' | 'quoted' | 'plain' {
  const comment = trailingComment(line);
  const colon = line.indexOf(':', /^["']/.test(line) ? jsonLikeKeyEnd(line) : 0);
  const end = comment === null ? undefined : line.length - comment.length;
  const value = line.slice(colon + 1, end).trim();
  if (/^[|>]/.test(value)) return 'block';
  if (/^["']/.test(value)) return closingQuote(value, 0) < 0 ? 'quoted' : 'plain';
  return 'plain';
}

/**
 * Where a top-level entry `key: value` of a YAML text is: from its key line to the last line of its
 * value. A value can go on over lines indented further (a `|` or `>` block, a multi-line quoted or
 * plain scalar), with blank lines in between; it ends before the first line at the mapping's own
 * indentation. Blank lines and comments after the value are not part of it: a comment line ends a
 * plain value (it is text only inside a block or quoted scalar).
 * @returns The first and last line index, or `null` when the key is not at the top level.
 */
function entryLines(
  lines: readonly string[],
  key: string,
  indent: string,
): { first: number; last: number } | null {
  const pattern = keyLine(key, indent);
  const first = lines.findIndex((line) => pattern.test(line));
  if (first < 0) return null;
  const style = valueStyle((lines[first] ?? '').slice(indent.length));
  let last = first;
  for (let i = first + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    if (!line.startsWith(indent) || !/^[ \t]/.test(line.slice(indent.length))) break;
    if (style === 'plain' && line.trimStart().startsWith('#')) break;
    last = i;
  }
  return { first, last };
}

/**
 * Sets a top-level scalar field (`id`, `name`) of a hall document, or removes it when `value` is
 * `undefined`. A missing field is added after the `version` line (or at the start of the
 * document). The rest of the text, its comments included, is left as it is.
 */
export function setTopLevelField(
  text: string,
  key: 'id' | 'name',
  value: string | undefined,
): string {
  if (isJsonText(text)) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const record: Record<string, unknown> = { ...parsed };
        if (value === undefined) delete record[key];
        else record[key] = value;
        return editJson(text, key, value, record);
      }
    } catch {
      // Not JSON after all: treat it as YAML below.
    }
  }
  const edited = editLines(text, key, value);
  // The line edit assumes the usual layout: a block mapping at column 0. A hall written another way
  // (an indented mapping, flow syntax `{ … }`) is edited as a parsed document instead, which keeps
  // its comments too. Either way the result reads back as the same hall with only `key` changed.
  const before = readHall(text);
  if (!before) return edited;
  const wanted: Record<string, unknown> = { ...before };
  if (value === undefined) delete wanted[key];
  else wanted[key] = value;
  const after = readHall(edited);
  if (after && sameData(after, wanted)) return edited;
  // A hall written as one flow mapping (`{ version: 1, name: …, meta: { … } }`) gets the same kind of
  // text edit as a JSON file: re-serialising it would write it out in block style, several times
  // larger, and a file that fit the upload limit could then be refused when it is stored.
  const flow = editFlowYaml(text, key, value);
  const read = flow === null ? undefined : readHall(flow);
  if (flow !== null && read && sameData(read, wanted)) return flow;
  return serializeHallConfig(wanted as unknown as HallConfig, { source: text });
}

/** Skips spaces, line breaks and `#` comments from `start`; returns the next other index. */
function skipFlowSpace(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const char = text[i] ?? '';
    if (/\s/.test(char)) i += 1;
    else if (char === '#' && (i === 0 || /\s/.test(text[i - 1] ?? ''))) {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else break;
  }
  return i;
}

/** A quote at `i` starts a quoted scalar only at the start of a token. */
const startsQuoted = (text: string, i: number, start: number): boolean =>
  (text[i] === '"' || text[i] === "'") && (i === start || /[\s[{,:]/.test(text[i - 1] ?? ''));

/** One past the closing quote of the YAML quoted scalar at `start` (it may span lines), or -1. */
function quotedEnd(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];
    if (quote === '"' && char === '\\') i += 1;
    else if (quote === "'" && char === "'" && text[i + 1] === "'") i += 1;
    else if (char === quote) return i + 1;
  }
  return -1;
}

/**
 * The end of a flow value that starts at `start` (a scalar, or a nested `[…]`/`{…}`): one past its
 * last character, and where the `,` or `}` after it is. `null` when the text ends first.
 */
function flowValueEnd(text: string, start: number): { end: number; stop: number } | null {
  let depth = 0;
  let end = start;
  let i = start;
  while (i < text.length) {
    const char = text[i] ?? '';
    if (startsQuoted(text, i, start)) {
      const close = quotedEnd(text, i);
      if (close < 0) return null;
      i = close;
      end = i;
      continue;
    }
    if (/\s/.test(char) || (char === '#' && /\s/.test(text[i - 1] ?? ''))) {
      i = skipFlowSpace(text, i);
      continue;
    }
    if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') {
      if (depth === 0) return { end, stop: i };
      depth -= 1;
    } else if (char === ',' && depth === 0) return { end, stop: i };
    i += 1;
    end = i;
  }
  return null;
}

/**
 * The top-level members of a YAML document that is one flow mapping (`{ key: value, … }`, after
 * any comments, directives and `---`), in order; `null` for any other document or a key this
 * scanner does not read (a nested key, an implicit one).
 */
function yamlFlowMembers(text: string): { open: number; members: JsonMember[] } | null {
  let i = 0;
  for (;;) {
    i = skipFlowSpace(text, i);
    const lineStart = i === 0 || text[i - 1] === '\n';
    if (lineStart && text[i] === '%') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else if (lineStart && /^---(?:\s|$)/.test(text.slice(i, i + 4))) i += 3;
    else break;
  }
  if (text[i] !== '{') return null;
  const open = i;
  const members: JsonMember[] = [];
  i += 1;
  for (;;) {
    i = skipFlowSpace(text, i);
    if (text[i] === '}') return { open, members };
    const keyStart = i;
    let key: string;
    if (startsQuoted(text, i, i)) {
      const end = quotedEnd(text, i);
      if (end < 0) return null;
      const raw = text.slice(i, end);
      if (raw.startsWith('"')) {
        // JSON reads the escapes YAML shares with it; a YAML-only one (`\x76`, a line break)
        // is a key this scanner does not read, and the caller then edits the parsed document.
        try {
          key = String(JSON.parse(raw));
        } catch {
          return null;
        }
      } else key = raw.slice(1, -1).replaceAll("''", "'");
      i = end;
    } else {
      // A plain key ends at a `:` followed by a space or a flow indicator.
      let end = i;
      while (
        end < text.length &&
        !(text[end] === ':' && /[\s,[\]{}]|^$/.test(text[end + 1] ?? ''))
      ) {
        if (/[,[\]{}#\n]/.test(text[end] ?? '')) return null;
        end += 1;
      }
      key = text.slice(i, end).trim();
      i = end;
    }
    i = skipFlowSpace(text, i);
    if (text[i] !== ':') return null;
    const valueStart = skipFlowSpace(text, i + 1);
    const value = flowValueEnd(text, valueStart);
    if (!value) return null;
    members.push({ key, keyStart, valueStart, valueEnd: Math.max(value.end, valueStart) });
    i = value.stop;
    if (text[i] === ',') i += 1;
  }
}

/** `setTopLevelField` on a YAML flow mapping, as a text edit; `null` when the text is not one. */
function editFlowYaml(text: string, key: 'id' | 'name', value: string | undefined): string | null {
  const found = yamlFlowMembers(text);
  if (!found) return null;
  return editMembers(text, found, key, value, {
    scalar: yamlScalar,
    entry: (item) => `${key}: ${yamlScalar(item)}`,
  });
}

/** Where a top-level member of a JSON object is in the text: its key and its value. */
interface JsonMember {
  key: string;
  /** Index of the key's opening quote. */
  keyStart: number;
  /** Index of the value's first character and one past its last. */
  valueStart: number;
  valueEnd: number;
}

/** One past the closing quote of the JSON string that starts at `start`. */
function jsonStringEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const char = text[i];
    if (char === '\\') i += 2;
    else if (char === '"') return i + 1;
    else i += 1;
  }
  return -1;
}

/** One past the end of the JSON value that starts at `start` (strings, nested objects, scalars). */
function jsonValueEnd(text: string, start: number): number {
  if (text[start] === '"') return jsonStringEnd(text, start);
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const char = text[i] ?? '';
    if (char === '"') {
      const end = jsonStringEnd(text, i);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      if (depth === 0) return i;
      depth -= 1;
      if (depth === 0) return i + 1;
    } else if (depth === 0 && (char === ',' || /\s/.test(char))) return i;
    i += 1;
  }
  return depth === 0 ? i : -1;
}

/** The top-level members of a JSON object text, in order; `null` when the text is not one. */
function jsonMembers(text: string): { open: number; members: JsonMember[] } | null {
  const open = text.indexOf('{');
  if (open < 0) return null;
  const members: JsonMember[] = [];
  let i = open + 1;
  const skipSpace = (): void => {
    while (i < text.length && /\s/.test(text[i] ?? '')) i += 1;
  };
  for (;;) {
    skipSpace();
    if (text[i] === '}') return { open, members };
    if (text[i] !== '"') return null;
    const keyStart = i;
    const keyEnd = jsonStringEnd(text, i);
    if (keyEnd < 0) return null;
    const key: unknown = JSON.parse(text.slice(keyStart, keyEnd));
    i = keyEnd;
    skipSpace();
    if (text[i] !== ':') return null;
    i += 1;
    skipSpace();
    const valueStart = i;
    const valueEnd = jsonValueEnd(text, i);
    if (valueEnd <= valueStart) return null;
    members.push({ key: String(key), keyStart, valueStart, valueEnd });
    i = valueEnd;
    skipSpace();
    if (text[i] === ',') i += 1;
    else if (text[i] !== '}') return null;
  }
}

/**
 * Sets or removes one top-level field of a JSON hall as a text edit: the rest of the document keeps
 * its formatting byte for byte, so it grows only by the new value and a document that fit the upload
 * limit still fits. A document the edit cannot place (a repeated key, say) is written compact.
 */
function editJson(
  text: string,
  key: string,
  value: string | undefined,
  wanted: Record<string, unknown>,
): string {
  const edited = editJsonText(text, key, value);
  if (edited !== null) {
    try {
      if (sameData(JSON.parse(edited), wanted)) return edited;
    } catch {
      // Fall through to the compact form.
    }
  }
  const json = JSON.stringify(wanted);
  return /\n\s*$/.test(text) ? `${json}\n` : json;
}

function editJsonText(text: string, key: string, value: string | undefined): string | null {
  const found = jsonMembers(text);
  if (!found) return null;
  return editMembers(text, found, key, value, {
    scalar: (item) => JSON.stringify(item),
    entry: (item, first) =>
      `${JSON.stringify(key)}:${first && /\s/.test(text[first.valueStart - 1] ?? '') ? ' ' : ''}${JSON.stringify(item)}`,
  });
}

/** The most indentation `editMembers` copies for a member it adds. */
const MAX_COPIED_INDENT = 32;

/**
 * Sets or removes one member of a mapping written `{ … }` (JSON, or a YAML flow mapping) as a text
 * edit, given where its members are. `null` when the key comes twice.
 */
function editMembers(
  text: string,
  found: { open: number; members: JsonMember[] },
  key: string,
  value: string | undefined,
  format: {
    scalar: (value: string) => string;
    entry: (value: string, first: JsonMember | undefined) => string;
  },
): string | null {
  const { open, members } = found;
  const matching = members.filter((member) => member.key === key);
  if (matching.length > 1) return null;
  const member = matching[0];
  if (member) {
    if (value !== undefined) {
      return text.slice(0, member.valueStart) + format.scalar(value) + text.slice(member.valueEnd);
    }
    const index = members.indexOf(member);
    const next = members[index + 1];
    const previous = members[index - 1];
    // Removed with the comma that separates it from its neighbour.
    if (next) return text.slice(0, member.keyStart) + text.slice(next.keyStart);
    if (previous) return text.slice(0, previous.valueEnd) + text.slice(member.valueEnd);
    return text.slice(0, member.keyStart) + text.slice(member.valueEnd);
  }
  if (value === undefined) return text;
  const first = members[0];
  const last = members[members.length - 1];
  const entry = format.entry(value, first);
  if (!first || !last) return text.slice(0, open + 1) + entry + text.slice(open + 1);
  // After the last member, on a line of its own when the last member has one, indented like it.
  // Only the line break and the indentation of that line are copied, at most `MAX_COPIED_INDENT`
  // characters: a long run of blank lines or spaces in front of the last member would otherwise be
  // written twice, and a file that fit the upload limit could outgrow the stored limit.
  let lead = last.keyStart;
  while (lead > 0 && /\s/.test(text[lead - 1] ?? '')) lead -= 1;
  const gap = text.slice(lead, last.keyStart);
  const lineEnd = gap.lastIndexOf('\n');
  const spacing =
    lineEnd < 0
      ? gap.slice(0, 1)
      : (gap[lineEnd - 1] === '\r' ? '\r\n' : '\n') +
        gap.slice(lineEnd + 1).slice(0, MAX_COPIED_INDENT);
  return text.slice(0, last.valueEnd) + ',' + spacing + entry + text.slice(last.valueEnd);
}

/**
 * The line edit of `setTopLevelField`: the whole value is replaced, continuation lines included,
 * and the comments and the layout of the rest of the document stay as they are.
 */
function editLines(text: string, key: 'id' | 'name', value: string | undefined): string {
  const lines = text.split('\n');
  const indent = topIndent(lines);
  const entry = entryLines(lines, key, indent);
  if (entry) {
    // A comment at the end of the key line is a note about the field: it stays with the new value
    // (or on its own line when the field is removed).
    const comment = trailingComment((lines[entry.first] ?? '').slice(indent.length));
    const kept =
      value === undefined
        ? comment === null
          ? []
          : [`${indent}${comment.trimStart()}`]
        : [`${indent}${key}: ${yamlScalar(value)}${comment ?? ''}`];
    lines.splice(entry.first, entry.last - entry.first + 1, ...kept);
    return lines.join('\n');
  }
  if (value === undefined) return text;
  const next = [`${indent}${key}: ${yamlScalar(value)}`];
  const version = entryLines(lines, 'version', indent);
  lines.splice(version ? version.last + 1 : 0, 0, ...next);
  return lines.join('\n');
}

/**
 * The comment at the end of a `key: value` line, with the spaces before it (`  # note`), or `null`.
 * A `#` counts only outside quotes and after a space, as YAML reads it.
 */
export function trailingComment(line: string): string | null {
  const colon = line.indexOf(':', /^["']/.test(line) ? jsonLikeKeyEnd(line) : 0);
  if (colon < 0) return null;
  let quote: '"' | "'" | null = null;
  for (let i = colon + 1; i < line.length; i += 1) {
    const char = line[i];
    if (quote === '"') {
      if (char === '\\') i += 1;
      else if (char === '"') quote = null;
    } else if (quote === "'") {
      // `''` is a quote inside the scalar.
      if (char === "'" && line[i + 1] === "'") i += 1;
      else if (char === "'") quote = null;
    } else if (char === '"' || char === "'") {
      // Quotes open a scalar only at its start.
      if (line.slice(colon + 1, i).trim() === '') quote = char;
    } else if (char === '#' && /[ \t]/.test(line[i - 1] ?? '')) {
      let start = i;
      while (start > colon + 1 && /[ \t]/.test(line[start - 1] ?? '')) start -= 1;
      return line.slice(start);
    }
  }
  return null;
}

/** One past the closing quote of a quoted key at the start of a line. */
function jsonLikeKeyEnd(line: string): number {
  const end = line.indexOf(line[0] ?? '"', 1);
  return end < 0 ? 0 : end + 1;
}

/**
 * The hall a text holds, or `undefined` when it is not one. Only the structure is checked (the size
 * limits are the caller's), so any hall the server accepted reads back.
 */
function readHall(text: string): Record<string, unknown> | undefined {
  const parsed = parseHallConfig(text, { format: 'yaml', maxBytes: Number.MAX_SAFE_INTEGER });
  return parsed.ok ? (parsed.config as unknown as Record<string, unknown>) : undefined;
}

/** Deep equality of parsed data, ignoring the order of object keys. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameData(item, b[i]))
    );
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const left = Object.entries(a).filter(([, item]) => item !== undefined);
  const right = new Map(Object.entries(b).filter(([, item]) => item !== undefined));
  return (
    left.length === right.size &&
    left.every(([name, item]) => right.has(name) && sameData(item, right.get(name)))
  );
}

/**
 * Replaces the header comment: the comment lines at the very top of a YAML document, up to the
 * first blank line, the first non-comment line or the generic `# Units:` line. Without a header
 * the new one is put at the top. JSON text is returned unchanged.
 */
export function replaceHeaderComment(text: string, header: string): string {
  if (isJsonText(text)) return text;
  const lines = text.split('\n');
  let end = 0;
  while (end < lines.length) {
    const line = lines[end] ?? '';
    if (!line.startsWith('#') || line.startsWith('# Units:')) break;
    end += 1;
  }
  const headerLines = header.split('\n').map((line) => (line.startsWith('#') ? line : `# ${line}`));
  return [...headerLines, ...lines.slice(end)].join('\n');
}

/** The header of a hall that the user made: names the hall, claims nothing about its origin. */
export function hallHeader(name: string): string {
  return `${HEADER_PREFIX} — ${name.replace(/\s+/g, ' ').trim()}.`;
}

/**
 * A document for a new hall made from an existing one: the new name and header, and the given id
 * (or none, so the server derives one from the name).
 */
export function prepareCopy(text: string, options: { name: string; id?: string }): string {
  const named = setTopLevelField(text, 'name', options.name);
  const withId = setTopLevelField(named, 'id', options.id);
  return replaceHeaderComment(withId, hallHeader(options.name));
}

/**
 * `prepareCopy`, or `null` when the copy would be larger than `maxBytes` (UTF-8). A hall stored at
 * its size limit grows a little when it is copied (the new name, the header comment), so a copy of
 * it may not fit.
 */
export function prepareCopyWithin(
  text: string,
  options: { name: string; id?: string },
  maxBytes: number,
): string | null {
  const copy = prepareCopy(text, options);
  return new TextEncoder().encode(copy).byteLength <= maxBytes ? copy : null;
}

const COPY_SUFFIX = ' (copy)';

/** The longest hall name the schema accepts (`name`, in UTF-16 code units as it counts them). */
export const MAX_HALL_NAME_CHARS = 120;

/** The first `max` code units of a text, without cutting a character made of two units in half. */
function cutTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/**
 * `Grand Hall` → `Grand Hall (copy)`; a name that already ends in `(copy)` stays as it is. The
 * result is never longer than a hall name may be: a long name is shortened so the suffix fits.
 */
export function copyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.endsWith(COPY_SUFFIX.trim()) && trimmed.length <= MAX_HALL_NAME_CHARS) return trimmed;
  const base = cutTo(trimmed, MAX_HALL_NAME_CHARS - COPY_SUFFIX.length).trimEnd();
  return `${base}${COPY_SUFFIX}`;
}
