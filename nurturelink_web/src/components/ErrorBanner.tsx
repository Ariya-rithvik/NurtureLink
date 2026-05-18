import { AlertTriangle } from 'lucide-react';

export default function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]"
      style={{
        background: 'color-mix(in oklch, var(--color-danger) 8%, transparent)',
        borderColor: 'color-mix(in oklch, var(--color-danger) 40%, transparent)',
        color: 'var(--color-danger)',
      }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="font-medium">{message}</span>
    </div>
  );
}
