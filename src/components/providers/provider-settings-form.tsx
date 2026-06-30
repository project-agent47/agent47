'use client';

import { type FormEvent, useState } from 'react';

interface ProviderSettingsFormProps {
  workspaceId: string;
}

export function ProviderSettingsForm({ workspaceId }: ProviderSettingsFormProps) {
  const [provider, setProvider] = useState('deepseek-compatible');
  const [model, setModel] = useState('deepseek-chat');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch(`/api/workspaces/${workspaceId}/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey }),
    });

    if (!response.ok) {
      setMessage('Unable to save provider settings.');
      return;
    }

    setMessage('Provider settings saved.');
  };

  return (
    <form className="panel p-6 sm:p-8" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Provider</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Provider settings</h2>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
          Ready
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block text-sm text-slate-300">
          <span className="mb-2 block">Provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)} className="input-field">
            <option value="deepseek-compatible">DeepSeek compatible</option>
            <option value="openai-compatible">OpenAI compatible</option>
          </select>
        </label>
        <label className="block text-sm text-slate-300">
          <span className="mb-2 block">Model</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} className="input-field" />
        </label>
        <label className="block text-sm text-slate-300">
          <span className="mb-2 block">API key</span>
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="input-field" />
        </label>
      </div>

      <button type="submit" className="btn-primary mt-6">
        Save settings
      </button>
      {message ? <p className="mt-3 text-sm text-slate-400">{message}</p> : null}
    </form>
  );
}
