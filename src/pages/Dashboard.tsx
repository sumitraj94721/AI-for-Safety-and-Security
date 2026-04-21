import React from 'react';
import Sidebar from '../components/Sidebar';
import StatusPanel from '../components/StatusPanel';
import { Camera, ShieldAlert, Satellite, BellRing } from 'lucide-react';

// --- Placeholder Component ---
// IMPORTANT: Do not implement camera logic here.
// The user will paste their existing camera code inside this component.
function CameraModule() {
  return (
    <div className="camera-placeholder">
      <Camera size={48} className="camera-placeholder-icon" />
      <p style={{ fontSize: '1.2rem', fontWeight: 500, marginBottom: '0.5rem' }}>Camera Stream Input</p>
      <p style={{ fontSize: '0.9rem', opacity: 0.6 }}>[ Paste Existing Camera Code Here ]</p>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="dash-layout">
      {/* LEFT: Sidebar navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="dash-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-title">Command Center</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Real-time monitoring & threat detection
            </p>
          </div>
        </header>

        <div className="dash-content">
          <div className="dash-center">
            {/* CENTER: CameraModule (main focus area) */}
            <CameraModule />

            {/* COMING SOON CARDS */}
            <div className="coming-soon-grid">
              <div className="coming-soon-card">
                <ShieldAlert size={32} />
                <span style={{ fontWeight: 600 }}>Security Logs</span>
                <span className="coming-soon-badge">Coming Soon</span>
              </div>
              
              <div className="coming-soon-card">
                <Satellite size={32} />
                <span style={{ fontWeight: 600 }}>Satellite Emergency</span>
                <span className="coming-soon-badge">Coming Soon</span>
              </div>
              
              <div className="coming-soon-card">
                <BellRing size={32} />
                <span style={{ fontWeight: 600 }}>Emergency Alerts</span>
                <span className="coming-soon-badge">Coming Soon</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Status Panel */}
          <div>
            <StatusPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
