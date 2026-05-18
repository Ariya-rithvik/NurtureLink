import type { ReactNode } from 'react';

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function PageHeader({ eyebrow, title, description, action }: Props) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div>
        {eyebrow && (
          <div
            className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'var(--color-accent)' }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className="text-[28px] font-bold leading-tight"
          style={{ letterSpacing: '-0.025em' }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="mt-2 max-w-xl text-[15px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
