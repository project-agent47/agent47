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

const workers = new Set<Worker>();
monaco.languages.register({ id: 'json' });
monaco.languages.setMonarchTokensProvider('json', { tokenizer: { root: [
  [/"([^"\\]|\\.)*"(?=\s*:)/, 'key'], [/"([^"\\]|\\.)*"/, 'string'],
  [/\b(true|false|null)\b/, 'keyword'], [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
  [/[{}[\]:,]/, 'delimiter']
] } });
(globalThis as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = { getWorker: () => { const worker = new EditorWorker(); workers.add(worker); return worker; } };
export default function CodeViewer({ content, name, theme }: { content: string; name: string; theme: string }) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const model = monaco.editor.createModel(content, codeLanguage(name));
    const editor = monaco.editor.create(node.current!, { model, readOnly: true, domReadOnly: true, automaticLayout: true,
      minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: 'on', lineNumbers: 'on',
      ariaLabel: `只读代码：${name}`, theme: theme === 'dark' ? 'vs-dark' : 'vs', contextmenu: false, links: false, editContext: false,
      hover: { enabled: 'off' }, unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false }, renderValidationDecorations: 'off' });
    return () => { editor.dispose(); model.dispose(); if (!monaco.editor.getModels().length) { for (const worker of workers) worker.terminate(); workers.clear(); } };
  }, [content, name, theme]);
  return <div className="code-viewer" ref={node} />;
}
