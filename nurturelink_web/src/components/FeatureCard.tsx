import { Link } from 'react-router-dom';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Props = {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tag?: string;
  locked?: boolean;
  lockedReason?: string;
};

export default function FeatureCard({
  to,
  icon: Icon,
  title,
  description,
  tag,
  locked,
  lockedReason,
}: Props) {
  const inner = (
    <div
      className="card card-hover group relative flex h-full flex-col p-7"
      style={{ opacity: locked ? 0.78 : 1 }}
    >
      <div className="mb-6 flex items-center justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: 'var(--color-accent-soft)' }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: 'var(--color-accent)' }}
            strokeWidth={2.2}
          />
        </div>
        {tag && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: 'var(--color-accent)',
              color: 'white',
            }}
          >
            {tag}
          </span>
        )}
        {locked && (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-muted)',
            }}
          >
            <LockKeyhole className="h-3 w-3" />
            Setup needed
          </span>
        )}
      </div>

      <h3 className="text-[19px] font-bold leading-snug">{title}</h3>
      <p
        className="mt-1.5 text-[14px] leading-relaxed"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {description}
      </p>

      {locked && lockedReason && (
        <p
          className="mt-3 text-[12px]"
          style={{ color: 'var(--color-text-subtle)' }}
        >
          {lockedReason}
        </p>
      )}

      <div className="mt-auto flex items-center gap-1 pt-6 text-[13px] font-semibold transition-transform group-hover:translate-x-0.5">
        <span style={{ color: 'var(--color-accent)' }}>Open</span>
        <ArrowUpRight
          className="h-3.5 w-3.5"
          style={{ color: 'var(--color-accent)' }}
        />
      </div>
    </div>
  );

  return (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  );
}
