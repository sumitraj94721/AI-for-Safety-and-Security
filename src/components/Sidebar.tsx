import React from 'react';
import { LayoutDashboard, ShieldAlert, Satellite, Settings } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar-logo">
        <ShieldAlert size={28} />
        <span>WatchTower</span>
      </div>

      <nav className="dash-nav">
        <div className="dash-nav-item active">
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </div>

        <div className="dash-nav-item">
          <ShieldAlert size={20} />
          <span>Security Logs</span>
          <span className="dash-nav-badge">Soon</span>
        </div>

        <div className="dash-nav-item">
          <Satellite size={20} />
          <span>Satellite Emergency</span>
          <span className="dash-nav-badge">Soon</span>
        </div>

        <div className="dash-nav-item" style={{ marginTop: 'auto' }}>
          <Settings size={20} />
          <span>Settings</span>
          <span className="dash-nav-badge">Soon</span>
        </div>
      </nav>
    </aside>
  );
}
