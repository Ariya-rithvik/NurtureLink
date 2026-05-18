import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import VoiceSetup from './pages/VoiceSetup';
import EyeBridge from './pages/EyeBridge';
import SignSpeak from './pages/SignSpeak';
import StoryWeaver from './pages/StoryWeaver';
import ParentBridge from './pages/ParentBridge';
import ChildVoice from './pages/ChildVoice';
import CalmCue from './pages/CalmCue';
import EarBridge from './pages/EarBridge';
import GuardianWatch from './pages/GuardianWatch';
import LifeGuardian from './pages/LifeGuardian';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/voice-setup" element={<VoiceSetup />} />
          <Route path="/eye-bridge" element={<EyeBridge />} />
          <Route path="/sign-speak" element={<SignSpeak />} />
          <Route path="/story-weaver" element={<StoryWeaver />} />
          <Route path="/calm-cue" element={<CalmCue />} />
          <Route path="/ear-bridge" element={<EarBridge />} />
          <Route path="/guardian-watch" element={<GuardianWatch />} />
          <Route path="/life-guardian" element={<LifeGuardian />} />
          <Route path="/parent-bridge" element={<ParentBridge />} />
          <Route path="/child-voice" element={<ChildVoice />} />
          <Route
            path="*"
            element={
              <div className="card p-8">
                <h2 className="text-xl font-bold">Page not found</h2>
              </div>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
