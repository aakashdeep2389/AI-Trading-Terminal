'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

export type WorkspaceTab = 'dashboard' | 'chart' | 'alerts' | 'strategies' | 'testing' | 'journal';

type Theme = 'dark' | 'light';

interface AppShellProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  symbol: string;
  timeframe: string;
  theme: Theme;
  onToggleTheme: () => void;
  alertCount: number;
  children: ReactNode;
}

const navigation: Array<{ id: WorkspaceTab; label: string; shortLabel: string; icon: string }> = [
  { id: 'dashboard', label: 'Market Dashboard', shortLabel: 'Overview', icon: '▦' },
  { id: 'chart', label: 'Chart & Analysis', shortLabel: 'Chart', icon: '◫' },
  { id: 'alerts', label: 'Alerts', shortLabel: 'Alerts', icon: '♢' },
  { id: 'strategies', label: 'Strategies & Backtest', shortLabel: 'Strategies', icon: '◇' },
  { id: 'testing', label: 'Testing & Paper Run', shortLabel: 'Paper', icon: '◌' },
  { id: 'journal', label: 'Trading Journal', shortLabel: 'Journal', icon: '▤' },
];

export default function AppShell({
  activeTab,
  onTabChange,
  symbol,
  timeframe,
  theme,
  onToggleTheme,
  alertCount,
  children,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar" aria-label="Workspace navigation">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">AI</span>
          <div>
            <span className="brand-name">TRADING TERMINAL</span>
            <span className="brand-edition">INSTITUTIONAL WORKSPACE</span>
          </div>
        </div>

        <div className="sidebar-section-row">
          <div className="sidebar-section-label">Workspace</div>
          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>
        <nav className="sidebar-nav" role="tablist" aria-label="Trading workspace">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {(item.id === 'chart' || item.id === 'alerts') && alertCount > 0 && (
                <span className="sidebar-nav-count" aria-label={`${alertCount} active alerts`}>{alertCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status-card">
            <span className="status-dot online" aria-hidden="true" />
            <div>
              <strong>Market data online</strong>
              <span>Realtime feed connected</span>
            </div>
          </div>
          <span className="sidebar-build">TERMINAL BUILD 1.0 · PAPER READY</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-context">
            <div className="topbar-eyebrow">ACTIVE WORKSPACE</div>
            <div className="topbar-title-row">
              <h1>{navigation.find((item) => item.id === activeTab)?.label}</h1>
              <span className="environment-badge"><span className="status-dot online" aria-hidden="true" />LIVE</span>
            </div>
          </div>

          <div className="topbar-market-context" aria-label="Current market context">
            <span className="context-label">INSTRUMENT</span>
            <strong>{symbol}</strong>
            <span className="context-separator" aria-hidden="true" />
            <span className="context-label">TIMEFRAME</span>
            <strong>{timeframe.toUpperCase()}</strong>
          </div>

          <div className="topbar-actions">
            <div className="topbar-connection"><span className="status-dot online" aria-hidden="true" />Data stream stable</div>
            <button
              type="button"
              className="topbar-icon-button notification-button"
              aria-label={`${alertCount} active alerts`}
              title="Open alert management"
              onClick={() => onTabChange('alerts')}
            >
              ◇
              {alertCount > 0 && <span className="notification-count">{alertCount}</span>}
            </button>
            <button
              type="button"
              className="topbar-icon-button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☼' : '◐'}
            </button>
            <button type="button" className="profile-chip" aria-label="Workspace profile">AT</button>
          </div>
        </header>

        <div className="mobile-workspace-nav" role="tablist" aria-label="Mobile workspace navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.shortLabel}</span>
            </button>
          ))}
        </div>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
