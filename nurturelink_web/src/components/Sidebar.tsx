import { NavLink } from 'react-router-dom';
import {
  Heart,
  Home,
  Eye,
  Hand,
  BookOpen,
  Baby,
  ShieldCheck,
  Mic,
  HeartHandshake,
  Ear,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import VoiceProfileChip from './VoiceProfileChip';
import { cn } from '../lib/cn';

type NavGroup = {
  label: string;
  items: {
    to: string;
    icon: typeof Home;
    label: string;
  }[];
};

const groups: NavGroup[] = [
  {
    label: 'Communicate',
    items: [
      { to: '/', icon: Home, label: 'Home' },
      { to: '/calm-cue', icon: HeartHandshake, label: 'CalmCue' },
      { to: '/eye-bridge', icon: Eye, label: 'EyeBridge' },
      { to: '/sign-speak', icon: Hand, label: 'SignSpeak' },
      { to: '/ear-bridge', icon: Ear, label: 'EarBridge' },
      { to: '/story-weaver', icon: BookOpen, label: 'StoryWeaver' },
    ],
  },
  {
    label: 'Wellness',
    items: [
      { to: '/guardian-watch', icon: ShieldAlert, label: 'GuardianWatch' },
      { to: '/life-guardian', icon: Sparkles, label: 'LifeGuardianAI' },
      { to: '/parent-bridge', icon: Baby, label: 'Parent Bridge' },
      { to: '/child-voice', icon: ShieldCheck, label: 'Child Check-in' },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r"
      style={{
        background: 'var(--color-bg-sidebar)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: 'var(--color-accent)' }}
        >
          <Heart className="h-5 w-5 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-[15px] font-bold leading-tight">NurtureLink</div>
          <div
            className="text-[11px] font-medium leading-tight"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Caregiver assist
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <div
              className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ color: 'var(--color-text-subtle)' }}
            >
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors',
                        isActive
                          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]'
                          : 'hover:bg-[var(--color-bg-elevated)]',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" strokeWidth={2} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mb-5">
          <div
            className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.08em]"
            style={{ color: 'var(--color-text-subtle)' }}
          >
            Setup
          </div>
          <NavLink
            to="/voice-setup"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors',
                isActive
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]'
                  : 'hover:bg-[var(--color-bg-elevated)]',
              )
            }
          >
            <Mic className="h-4 w-4" strokeWidth={2} />
            <span>Voice Setup</span>
          </NavLink>
        </div>
      </nav>

      <div className="border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
        <VoiceProfileChip />
      </div>
    </aside>
  );
}
