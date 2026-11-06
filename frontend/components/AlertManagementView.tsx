'use client';

import type { Alert } from '../lib/schemas';

export type BollingerRunStatus = 'running' | 'paused' | 'stopped';

export interface ReceivedAlert {
  id: string;
  source: 'bollinger' | 'rule';
  kind: string;
  symbol: string;
  timeframe?: string;
  message: string;
  receivedAt: string;
}

interface AlertManagementViewProps {
  alerts: Alert[];
  receivedAlerts: ReceivedAlert[];
  bollingerStatuses: Record<string, BollingerRunStatus>;
  soundEnabled: boolean;
  soundVolume: number;
  controlError: string | null;
  onSetBollingerStatus: (symbol: string, status: BollingerRunStatus) => void;
  onToggleAlert: (id: string, enabled: boolean) => void;
  onStopAlert: (id: string) => void;
  onToggleSound: () => void;
  onSoundVolumeChange: (volume: number) => void;
}

const SYMBOLS = ['BTCUSDT', 'XAUUSD'];

export default function AlertManagementView({
  alerts,
  receivedAlerts,
  bollingerStatuses,
  soundEnabled,
  soundVolume,
  controlError,
  onSetBollingerStatus,
  onToggleAlert,
  onStopAlert,
  onToggleSound,
  onSoundVolumeChange,
}: AlertManagementViewProps) {
  const activeCount = alerts.filter((alert) => alert.enabled).length
    + SYMBOLS.filter((symbol) => (bollingerStatuses[symbol] ?? 'running') === 'running').length;
  const groupedAlerts = SYMBOLS.map((symbol) => ({
    symbol,
    alerts: alerts.filter((alert) => alert.symbol === symbol),
  }));

  return (
    <div className="alert-management-page">
      <header className="alert-page-heading">
        <div>
          <span className="section-eyebrow">ALERT CENTER</span>
          <h2>Alerts & notifications</h2>
          <p>Manage instrument alerts and review every notification received on this browser.</p>
        </div>
        <div className="alert-page-counts" aria-label="Alert counts">
          <div><strong>{receivedAlerts.length}</strong><span>Received</span></div>
          <div><strong>{activeCount}</strong><span>Running</span></div>
          <div><strong>{alerts.length + SYMBOLS.length}</strong><span>Configured</span></div>
        </div>
      </header>

      <section className="panel alert-sound-settings" aria-labelledby="alert-sound-title">
        <div className="alert-settings-copy">
          <span className="section-eyebrow">NOTIFICATION SETTINGS</span>
          <h3 id="alert-sound-title">Alert sound</h3>
          <p>Sound is opt-in. Enable it here and adjust the volume for incoming alerts.</p>
        </div>
        <div className="alert-sound-settings-controls">
          <button type="button" className="panel-action-btn primary" onClick={onToggleSound} aria-pressed={soundEnabled}>
            {soundEnabled ? 'Disable sound' : 'Enable alert sound'}
          </button>
          <label className="alert-volume-control">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={soundVolume}
              onChange={(event) => onSoundVolumeChange(Number(event.target.value))}
              disabled={!soundEnabled}
              aria-label="Alert sound volume"
            />
            <output>{soundVolume}%</output>
          </label>
          <span className={`alert-sound-state ${soundEnabled ? 'enabled' : ''}`} role="status">
            {soundEnabled ? 'Sound enabled' : 'Sound disabled'}
          </span>
        </div>
      </section>

      <section className="panel instrument-alert-settings" aria-labelledby="instrument-alerts-title">
        <div className="panel-header-row">
          <div>
            <span className="section-eyebrow">TELEGRAM + PLATFORM</span>
            <h3 id="instrument-alerts-title">Instrument alerts</h3>
          </div>
          <span className="alert-list-summary">{activeCount} running</span>
        </div>
        {controlError && <p className="alert-control-error" role="alert">{controlError}</p>}

        <div className="instrument-alert-groups">
          {groupedAlerts.map(({ symbol, alerts: symbolAlerts }) => {
            const status = bollingerStatuses[symbol] ?? 'running';
            return (
              <article className="instrument-alert-group" key={symbol}>
                <header className="instrument-alert-group-header">
                  <div>
                    <strong>{symbol}</strong>
                    <span className={`status-pill ${status === 'running' ? 'active' : 'paused'}`}>
                      BOLLINGER {status.toUpperCase()}
                    </span>
                  </div>
                  <div className="instrument-alert-actions">
                    {status !== 'running' && (
                      <button type="button" onClick={() => onSetBollingerStatus(symbol, 'running')}>Start</button>
                    )}
                    {status === 'running' && (
                      <button type="button" onClick={() => onSetBollingerStatus(symbol, 'paused')}>Pause</button>
                    )}
                    {status !== 'stopped' && (
                      <button type="button" className="stop-alert-button" onClick={() => onSetBollingerStatus(symbol, 'stopped')}>Stop</button>
                    )}
                  </div>
                </header>
                <p className="instrument-alert-description">Bollinger Band MTF notifications to the platform and configured Telegram chat.</p>
                {symbolAlerts.length > 0 ? symbolAlerts.map((alert) => (
                  <div className="managed-alert-row" key={alert.id}>
                    <div className="managed-alert-description">
                      <strong>{alert.name}</strong>
                      <span>{alert.condition_type.toUpperCase()} · {alert.direction === 'up' ? 'Above' : 'Below'} {alert.condition_value} · {alert.timeframe}</span>
                    </div>
                    <span className={`status-pill ${alert.enabled ? 'active' : 'paused'}`}>{alert.enabled ? 'ACTIVE' : 'PAUSED'}</span>
                    <div className="instrument-alert-actions">
                      <button type="button" onClick={() => onToggleAlert(alert.id, !alert.enabled)}>{alert.enabled ? 'Pause' : 'Start'}</button>
                      <button type="button" className="stop-alert-button" onClick={() => onStopAlert(alert.id)}>Stop</button>
                    </div>
                  </div>
                )) : (
                  <p className="managed-alert-empty">No custom price or indicator alerts configured.</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel received-alert-history" aria-labelledby="received-alerts-title">
        <div className="panel-header-row">
          <div>
            <span className="section-eyebrow">NOTIFICATION HISTORY</span>
            <h3 id="received-alerts-title">Received alerts <span className="received-alert-count">{receivedAlerts.length}</span></h3>
          </div>
        </div>
        {receivedAlerts.length === 0 ? (
          <div className="alerts-empty-state">
            <span className="empty-bell" aria-hidden="true">🔔</span>
            <p className="empty-title">No alerts received yet</p>
            <p className="empty-sub">New platform alert notifications will be recorded here.</p>
          </div>
        ) : (
          <div className="received-alert-list">
            {receivedAlerts.map((alert) => (
              <article className="received-alert-row" key={alert.id}>
                <span className={`received-alert-source ${alert.source}`}>{alert.source === 'bollinger' ? 'BB' : '!'}</span>
                <div className="received-alert-copy">
                  <strong>{alert.symbol} · {alert.kind.toUpperCase()}{alert.timeframe ? ` · ${alert.timeframe}` : ''}</strong>
                  <span>{alert.message}</span>
                </div>
                <time dateTime={alert.receivedAt}>{new Date(alert.receivedAt).toLocaleString()}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
