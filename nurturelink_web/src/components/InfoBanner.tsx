import { Info } from 'lucide-react';

export default function InfoBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]"
      style={{
        background: 'var(--color-accent-soft)',
        borderColor:
          'color-mix(in oklch, var(--color-accent) 50%, transparent)',
        color: 'var(--color-accent-text)',
      }}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="font-medium leading-snug">{message}</span>
    </div>
  );
}
