import type { Yaml } from 'mdast';
import { isMap, isScalar, parseDocument, type Node as YamlNode } from 'yaml';
import spdxIds from 'spdx-license-ids/index.json' with { type: 'json' };
import spdxDeprecated from 'spdx-license-ids/deprecated.json' with { type: 'json' };
import type { JsonValue, Meta, MetaEntry, Range } from '../model.js';
import type { ParseContext } from './blocks.js';

const SPDX = new Set<string>([...spdxIds, ...spdxDeprecated]);
// One token, no spaces: what an SPDX id looks like. Anything else is free text.
const SPDX_LIKE = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/;

export function readFrontMatter(ctx: ParseContext, node: Yaml | undefined): Meta {
  const meta: Meta = { range: null, values: {}, entries: [], licence: null };
  const { source, template, problems } = ctx;
  const documentStart = source.range(0, 0);

  if (node) {
    meta.range = source.nodeRange(node);
    // The node's value is the text between the fences: it starts on the line
    // after the opening "---", so YAML offsets map onto the document by adding
    // that line's end.
    const fenceEnd = source.text.indexOf('\n', source.start(node)) + 1;
    const at = (from: number, to: number): Range => source.range(fenceEnd + from, fenceEnd + to);
    const doc = parseDocument(node.value, { uniqueKeys: true, prettyErrors: false });

    for (const error of doc.errors) {
      problems.push({
        code: 'meta.yaml',
        severity: 'error',
        message: `Invalid YAML in the front matter: ${error.message.split('\n')[0]}`,
        range: at(error.pos[0], error.pos[1]),
      });
    }

    if (doc.errors.length === 0 && doc.contents !== null && !isMap(doc.contents)) {
      problems.push({
        code: 'meta.yaml',
        severity: 'error',
        message: 'The front matter must be a list of "key: value" lines.',
        range: meta.range,
      });
    }

    if (doc.errors.length === 0 && isMap(doc.contents)) {
      for (const pair of doc.contents.items) {
        const key = pair.key as YamlNode | null;
        const value = pair.value as YamlNode | null;
        if (!isScalar(key) || !key.range) continue;
        const name = String(key.value);
        const end = value?.range ? value.range[1] : key.range[1];
        const entry: MetaEntry = {
          key: name,
          known: template.meta.some((k) => k.key === name),
          value: (value ? value.toJSON() : null) as JsonValue,
          range: at(key.range[0], end),
          keyRange: at(key.range[0], key.range[1]),
        };
        meta.entries.push(entry);
        meta.values[name] = entry.value;
      }
    }
  }

  for (const entry of meta.entries) {
    const definition = template.meta.find((k) => k.key === entry.key);
    if (!definition) {
      problems.push({
        code: 'meta.unknown',
        severity: 'warning',
        message: `Unknown front matter key "${entry.key}". Known keys: ${template.meta.map((k) => k.key).join(', ')}.`,
        range: entry.keyRange,
      });
      continue;
    }
    const { value } = entry;
    if (value === null) continue;
    const scalar = typeof value === 'string' || typeof value === 'number';
    const valid =
      definition.type === 'list'
        ? scalar || (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number'))
        : definition.type === 'licence'
          ? typeof value === 'string'
          : scalar;
    if (!valid) {
      problems.push({
        code: 'meta.type',
        severity: 'error',
        message: `"${entry.key}" must be ${definition.type === 'list' ? 'text or a list of text' : 'text'}.`,
        range: entry.range,
      });
      continue;
    }
    if (definition.type === 'licence' && typeof value === 'string') {
      const text = value.trim();
      const spdx = SPDX.has(text);
      meta.licence = { text, spdx };
      if (!spdx && SPDX_LIKE.test(text)) {
        problems.push({
          code: 'meta.licence.unknown',
          severity: 'warning',
          message: `"${text}" looks like an SPDX licence id but is not one; write a known id (as CC-BY-NC-SA-4.0) or free text.`,
          range: entry.range,
        });
      }
    }
  }

  for (const definition of template.meta) {
    if (definition.requirement === 'optional') continue;
    const value = meta.values[definition.key];
    if (value !== undefined && value !== null && value !== '') continue;
    problems.push({
      code: 'meta.required',
      severity: definition.requirement === 'required' ? 'error' : 'warning',
      message: `The front matter has no "${definition.key}".`,
      range: meta.range ?? documentStart,
    });
  }

  return meta;
}
