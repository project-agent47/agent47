import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/css/register';
import 'monaco-editor/languages/definitions/yaml/register';
import 'monaco-editor/languages/definitions/sql/register';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/shell/register';
import { codeLanguage } from '../shared/documents';
import { displayText, rawSelection } from '../shared/file-edits';

const workers = new Set<Worker>();
monaco.languages.register({ id: 'json' });
monaco.languages.setMonarchTokensProvider('json', { tokenizer: { root: [
  [/"([^"\\]|\\.)*"(?=\s*:)/, 'key'], [/"([^"\\]|\\.)*"/, 'string'],
  [/\b(true|false|null)\b/, 'keyword'], [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
  [/[{}[\]:,]/, 'delimiter']
] } });
(globalThis as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = { getWorker: () => { const worker = new EditorWorker(); workers.add(worker); return worker; } };
export default function CodeViewer({ content, name, theme, before, onSelection }: { content: string; name: string; theme: string; before?: string; onSelection?: (range?: { start: number; end: number }) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const selection = useRef(onSelection); selection.current = onSelection;
  useEffect(() => {
    const model = monaco.editor.createModel(displayText(content), codeLanguage(name));
    const options = { readOnly: true, domReadOnly: true, automaticLayout: true,
      minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: 'on', lineNumbers: 'on',
      ariaLabel: `只读代码：${name}`, theme: theme === 'dark' ? 'vs-dark' : 'vs', contextmenu: false, links: false, editContext: false,
      hover: { enabled: 'off' }, unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false }, renderValidationDecorations: 'off' } as const;
    let editor: { dispose(): void }, original: monaco.editor.ITextModel | undefined;
    if (before !== undefined) {
      original = monaco.editor.createModel(displayText(before), codeLanguage(name));
      const diff = monaco.editor.createDiffEditor(node.current!, { ...options, renderSideBySide: false, originalEditable: false, ignoreTrimWhitespace: false, maxComputationTime: 2000 });
      diff.setModel({ original, modified: model }); editor = diff;
    } else {
      const code = monaco.editor.create(node.current!, { ...options, model }); editor = code;
      code.onDidChangeCursorSelection(e => {
        if (e.selection.isEmpty()) { selection.current?.(); return; }
        try { selection.current?.(rawSelection(content, model.getOffsetAt(e.selection.getStartPosition()), model.getOffsetAt(e.selection.getEndPosition()))); }
        catch { selection.current?.(); }
      });
    }
    return () => { editor.dispose(); original?.dispose(); model.dispose(); if (!monaco.editor.getModels().length) { for (const worker of workers) worker.terminate(); workers.clear(); } };
  }, [content, name, theme, before]);
  return <div className="code-viewer" ref={node} />;
}
