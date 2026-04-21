import React from 'react';
import { Activity, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function StatusPanel() {
  return (
    <div className="status-panel">
      <div className="status-panel-title">
        <Activity size={20} className="status-pulse" />
        System Status
      </div>

      <div className="status-item">
        <span className="status-label">Monitoring</span>
        <div className="status-value normal">
          <Activity size={18} />
          Active
        </div>
      </div>

      <div className="status-item">
        <span className="status-label">Threat Level</span>
        <div className="status-value safe">
          <ShieldCheck size={18} />
          LOW
        </div>
      </div>

      <div className="status-item">
        <span className="status-label">Overall Status</span>
        <div className="status-value normal">
          <Activity size={18} />
          NORMAL
        </div>
      </div>
    </div>
  );
}
