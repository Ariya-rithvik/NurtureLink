import { useState } from 'react';
import { ExternalLink, KeyRound, Trash2, X } from 'lucide-react';
import { getGeminiKey, setGeminiKey } from '../lib/geminiClient';

type Props = {
  onClose: () => void;
  onSaved?: (key: string) => void;
};

export default function GeminiKeyDialog({ onClose, onSaved }: Props) {
  const [value, setValue] = useState(() => getGeminiKey() ?? '');
  const [showKey, setShowKey] = useState(false);

  function save() {
    setGeminiKey(value);
    onSaved?.(value);
    onClose();
  }

  function clear() {
    setGeminiKey('');
    setValue('');
    onSaved?.('');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h3 className="flex items-center gap-2 text-[15px] font-bold">
            <KeyRound className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
            Gemini API key
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg-elevated)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p
            className="mb-4 text-[13px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Used only by EyeBridge's AI gaze mode. Stored in your browser's
            localStorage — never sent to our backend. Get a free key from{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
              style={{ color: 'var(--color-accent)' }}
            >
              Google AI Studio
              <ExternalLink className="ml-0.5 inline h-3 w-3" />
            </a>
            .
          </p>

          <label
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            API key
          </label>
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={showKey ? 'text' : 'password'}
              placeholder="AIza..."
              className="min-w-0 flex-1 rounded-xl border px-3 py-2 font-mono text-[12px] outline-none"
              style={{
                background: 'var(--color-bg-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="btn-secondary"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="mt-5 flex justify-between">
            <button
              onClick={clear}
              className="btn-secondary"
              style={{ color: 'var(--color-danger)' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!value.trim()}
                className="btn-primary"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        <div
          className="border-t px-5 py-3 text-[11px]"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-muted)',
          }}
        >
          Default model: <code className="font-mono">gemini-2.0-flash</code> · ~$0.0001
          per guess · stays on your device.
        </div>
      </div>
    </div>
  );
}
