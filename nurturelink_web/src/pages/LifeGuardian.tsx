import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ExternalLink,
  Code2,
  Sparkles,
  Zap,
  ArrowRight,
  HeartHandshake,
  Mic,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';

const AI_STUDIO_URL =
  'https://aistudio.google.com/apps/drive/1JLQbtCL9zPCrcd_f3y3c3MnVqTXS71h0';
const GITHUB_URL = 'https://github.com/Ariya-rithvik/LifeGuardianAI';

export default function LifeGuardian() {
  return (
    <div>
      <PageHeader
        eyebrow="Companion app"
        title="LifeGuardianAI"
        description="The original always-on guardian for kids and elders, built on Google AI Studio with Gemini Live. GuardianWatch is NurtureLink's adaptation — this page links you to the full standalone version."
      />

      {/* Hero card */}
      <div
        className="relative mb-6 overflow-hidden rounded-2xl border p-8 lg:p-10"
        style={{
          background:
            'linear-gradient(135deg, var(--color-accent-soft) 0%, var(--color-bg-card) 70%)',
          borderColor: 'var(--color-accent)',
        }}
      >
        <div className="relative z-10 max-w-2xl">
          <div
            className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            <ShieldAlert className="h-3 w-3" />
            <span>Standalone app</span>
          </div>
          <h2
            className="text-[28px] font-bold leading-tight"
            style={{ letterSpacing: '-0.025em' }}
          >
            An AI guardian for the moments you can't be in the room.
          </h2>
          <p
            className="mt-3 max-w-xl text-[15px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Real-time multimodal audio + video monitoring with Gemini 2.5 Flash
            Live. Detects hazards for children, falls and medical events for
            elders, and speaks instructions back via voice synthesis. Built
            with Google AI Studio.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={AI_STUDIO_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              <Sparkles className="h-4 w-4" />
              Launch on AI Studio
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              <Code2 className="h-4 w-4" />
              View source
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full opacity-25"
          style={{
            background:
              'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Comparison: LifeGuardianAI vs GuardianWatch */}
      <section className="mb-8">
        <h3 className="mb-4 text-[16px] font-bold">
          Two flavours, same idea
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            className="card flex flex-col p-6"
            style={{ borderColor: 'var(--color-accent)' }}
          >
            <div
              className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent-text)',
              }}
            >
              <Zap className="h-3 w-3" />
              Original
            </div>
            <h4 className="text-[18px] font-bold">LifeGuardianAI</h4>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Standalone React app on Google AI Studio. Uses{' '}
              <strong>Gemini 2.5 Flash Live</strong> WebSocket streaming for
              continuous real-time analysis. Two-way voice. Built by Ariya
              Rithvik.
            </p>
            <ul
              className="mt-3 space-y-1.5 text-[12px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <li>· 3 fps video + 16 kHz audio streaming</li>
              <li>· Bidirectional voice via Kore TTS</li>
              <li>· Best when you have AI Studio access</li>
              <li>· Burns Gemini quota fast (Live API)</li>
            </ul>
            <a
              href={AI_STUDIO_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-5 justify-center"
            >
              Open in AI Studio
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div
            className="card flex flex-col p-6"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-muted)',
              }}
            >
              <HeartHandshake className="h-3 w-3" />
              In NurtureLink
            </div>
            <h4 className="text-[18px] font-bold">GuardianWatch</h4>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              The same idea adapted into NurtureLink. Speaks to your child in{' '}
              <strong>YOUR cloned voice</strong> (not a stock TTS). Polls Gemini
              every 12 seconds so the free tier lasts an hour.
            </p>
            <ul
              className="mt-3 space-y-1.5 text-[12px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <li>· 12 s polling instead of streaming</li>
              <li>· Child / Elder mode toggle</li>
              <li>· Cloned parent voice intervention</li>
              <li>· GPS + WhatsApp alert + Gemini call script</li>
              <li>· Friendlier on free Gemini quota</li>
            </ul>
            <Link to="/guardian-watch" className="btn-secondary mt-5 justify-center">
              <ShieldAlert className="h-4 w-4" />
              Open GuardianWatch
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* What it watches for */}
      <section className="mb-8">
        <h3 className="mb-4 text-[16px] font-bold">What it watches for</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="card p-5">
            <div
              className="mb-2 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Child mode
            </div>
            <ul className="space-y-1 text-[13px]">
              <li>· Sharp objects (knives, scissors, glass)</li>
              <li>· Heat hazards (stove, fire, candles)</li>
              <li>· Toxic substances (chemicals, meds)</li>
              <li>· Choking hazards</li>
              <li>· Climbing / fall risks</li>
              <li>· Strangers in frame</li>
            </ul>
          </div>
          <div className="card p-5">
            <div
              className="mb-2 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Elder mode
            </div>
            <ul className="space-y-1 text-[13px]">
              <li>· Falls (lying motionless)</li>
              <li>· Hand-on-chest (cardiac sign)</li>
              <li>· Unconsciousness / non-response</li>
              <li>· Unsteady standing / leaning</li>
              <li>· Medication confusion</li>
              <li>· Wandering toward exits</li>
            </ul>
          </div>
        </div>
      </section>

      <p
        className="max-w-3xl text-[12px] leading-relaxed"
        style={{ color: 'var(--color-text-subtle)' }}
      >
        Safety: AI cameras catch some moments and miss others. Treat any alert as
        a reminder to check on the person — not as a substitute for an adult in
        the room. Call local emergency services for real emergencies.
      </p>
    </div>
  );
}

// Suppress unused-import warning for Mic
export const __k = [Mic];
