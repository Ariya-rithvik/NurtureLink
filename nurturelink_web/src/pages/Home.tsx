import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  Hand,
  BookOpen,
  Baby,
  ShieldCheck,
  Mic,
  Sparkles,
  ArrowRight,
  HeartHandshake,
  Ear,
  ShieldAlert,
} from 'lucide-react';
import FeatureCard from '../components/FeatureCard';
import { loadProfile, type VoiceProfile } from '../lib/voiceProfile';

export default function Home() {
  const [profile, setProfile] = useState<VoiceProfile | null>(() => loadProfile());

  useEffect(() => {
    const handler = () => setProfile(loadProfile());
    window.addEventListener('profile:changed', handler);
    return () => window.removeEventListener('profile:changed', handler);
  }, []);

  const ready = !!profile;
  const name = profile?.parentName || 'caregiver';

  return (
    <div>
      {/* Hero card */}
      <div
        className="relative mb-8 overflow-hidden rounded-2xl border p-8 lg:p-10"
        style={{
          background:
            'linear-gradient(135deg, var(--color-accent-soft) 0%, var(--color-bg-card) 70%)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="relative z-10 max-w-xl">
          <div
            className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{
              background: 'var(--color-accent)',
              color: 'white',
            }}
          >
            <Sparkles className="h-3 w-3" />
            <span>NurtureLink v3</span>
          </div>
          <h1
            className="text-[34px] font-bold leading-[1.1] lg:text-[40px]"
            style={{ letterSpacing: '-0.03em' }}
          >
            {ready
              ? `Welcome back, ${name}.`
              : 'Every parent deserves to be heard.'}
          </h1>
          <p
            className="mt-3 max-w-md text-[15px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {ready
              ? 'Your voice is ready. Pick a feature below to start.'
              : 'NurtureLink helps disabled and deaf caregivers communicate with their children using Gemma 4 and natural voice synthesis. Set up your voice in about a minute.'}
          </p>
          {!ready && (
            <Link to="/voice-setup" className="btn-primary mt-6">
              <Mic className="h-4 w-4" />
              Set up your voice
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        <div
          className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full opacity-30"
          style={{
            background:
              'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Headline feature — CalmCue */}
      <section className="mb-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[18px] font-bold">The flagship — when seconds matter</h2>
          <span
            className="text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Auto-comfort in your voice
          </span>
        </div>
        <Link to="/calm-cue" className="block">
          <div
            className="card card-hover relative overflow-hidden p-7"
            style={{
              background:
                'linear-gradient(120deg, var(--color-accent-soft) 0%, var(--color-bg-card) 60%)',
              borderColor: ready ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            <div className="flex items-start gap-5">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: 'var(--color-accent)' }}
              >
                <HeartHandshake
                  className="h-7 w-7 text-white"
                  strokeWidth={2.2}
                />
              </div>
              <div className="min-w-0">
                <div
                  className="mb-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Flagship
                </div>
                <h3 className="text-[22px] font-bold leading-tight">
                  CalmCue — auto-comfort co-regulation
                </h3>
                <p
                  className="mt-2 max-w-2xl text-[14px] leading-relaxed"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  When your child cries, CalmCue hears it, runs the cry through
                  the classifier, and plays a soothing phrase in your voice —
                  within seconds. For the moments you can't be there fast enough:
                  the locked-in parent, the deaf parent in the next room, the
                  caregiver in another meeting.
                </p>
                <div className="mt-4 flex items-center gap-1 text-[13px] font-semibold">
                  <span style={{ color: 'var(--color-accent)' }}>
                    Open CalmCue
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--color-accent)' }}
                  />
                </div>
              </div>
            </div>
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-30"
              style={{
                background:
                  'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
              }}
            />
          </div>
        </Link>
      </section>

      {/* Other accessibility features */}
      <section className="mb-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[18px] font-bold">For disabled caregivers</h2>
          <span
            className="text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Powered by Gemma 4 + Edge TTS
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FeatureCard
            to="/eye-bridge"
            icon={Eye}
            title="EyeBridge"
            description="Parent → child. A phrase grid that fills when you focus on a tile, then voices it in your matched voice."
            locked={!ready}
            lockedReason="Needs a voice profile to speak."
          />
          <FeatureCard
            to="/sign-speak"
            icon={Hand}
            title="SignSpeak"
            description="Parent → child. Make a hand sign — Gemma identifies it and speaks the word in your voice."
            locked={!ready}
            lockedReason="Needs a voice profile to speak."
          />
          <FeatureCard
            to="/ear-bridge"
            icon={Ear}
            title="EarBridge"
            description="Child → parent. Live captions of what your hearing child says, with emotion cues and optional ASL avatar link."
          />
          <FeatureCard
            to="/story-weaver"
            icon={BookOpen}
            title="StoryWeaver"
            description="Pick a theme and an age. Gemma writes a four-scene bedtime story, narrated in your voice with your face glowing."
            locked={!ready}
            lockedReason="Needs a voice profile to narrate."
          />
          <FeatureCard
            to="/parent-bridge"
            icon={Baby}
            title="Parent Bridge"
            description="Record a baby cry and a quick photo. NurtureLink decodes likely needs—hunger, gas, tired, discomfort—with calm guidance."
          />
        </div>
      </section>

      {/* Wellness row */}
      <section>
        <div className="mb-4">
          <h2 className="text-[18px] font-bold">When you can't be in the room</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FeatureCard
            to="/guardian-watch"
            icon={ShieldAlert}
            title="GuardianWatch"
            description="An AI guardian watches your child via webcam. When it sees a hazard, it speaks to them in your voice and logs the moment."
            tag="New"
          />
          <FeatureCard
            to="/child-voice"
            icon={ShieldCheck}
            title="Child Voice Check-in"
            description="A gentle visual check-in for non-verbal or limited-verbal children. Notice changes calmly, not as diagnosis."
          />
          <Link
            to="/voice-setup"
            className="card card-hover group flex items-center gap-4 p-7"
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'var(--color-accent-soft)' }}
            >
              <Mic
                className="h-5 w-5"
                style={{ color: 'var(--color-accent)' }}
                strokeWidth={2.2}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold">
                {ready ? 'Your voice profile' : 'Set up your voice'}
              </div>
              <div
                className="mt-0.5 truncate text-[13px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {ready
                  ? `${profile!.displayName} · ${profile!.accent}`
                  : 'Record 10 seconds — required for speaking features.'}
              </div>
            </div>
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              style={{ color: 'var(--color-accent)' }}
            />
          </Link>
        </div>
      </section>

      {/* Safety note */}
      <p
        className="mt-10 max-w-3xl text-[12px] leading-relaxed"
        style={{ color: 'var(--color-text-subtle)' }}
      >
        Safety: NurtureLink is an assistive tool, not a medical diagnosis. It does
        not detect abuse. If something feels urgent, contact a professional.
      </p>
    </div>
  );
}
