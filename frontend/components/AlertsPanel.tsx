'use client';

import { useState, type FormEvent } from 'react';
import type { Alert, AlertFormInput } from '../lib/schemas';

interface AlertsPanelProps {
  symbol: string;
  alerts: Alert[];
  currentPrice?: number;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onCreate: (input: AlertFormInput) => void;
}

export default function AlertsPanel({
  symbol,
  alerts,
  currentPrice,
  onToggle,
  onDelete,
  onCreate,
}: AlertsPanelProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);

  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const filteredAlerts = safeAlerts.filter((a) => {
    if (filter === 'active') return a.enabled;
    if (filter === 'inactive') return !a.enabled;
    return true;
  });

  const activeCount = safeAlerts.filter((a) => a.enabled).length;

  return (
    <div className="panel alerts-panel-wrapper">
      <div className="panel-header-row">
        <div className="panel-title-with-badge">
          <span className="panel-badge alert">TRIGGERS</span>
          <h2 className="panel-title">Price & Indicator Alerts</h2>
        </div>
        <button
          type="button"
          className="panel-action-btn primary"
          onClick={() => setShowModal(true)}
        >
          + New Alert
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="alerts-filter-tabs">
        <button
          type="button"
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({Array.isArray(alerts) ? alerts.length : 0})
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          Active ({activeCount})
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === 'inactive' ? 'active' : ''}`}
          onClick={() => setFilter('inactive')}
        >
          Paused ({Array.isArray(alerts) ? alerts.length : 0} - {activeCount})
        </button>
      </div>

      {/* Alert List */}
      <div className="alerts-list-container">
        {filteredAlerts.length === 0 ? (
          <div className="alerts-empty-state">
            <span className="empty-bell">🔔</span>
            <p className="empty-title">No alerts in this view</p>
            <p className="empty-sub">
              {filter === 'all'
                ? `Set a price threshold or indicator trigger for ${symbol}.`
                : `No ${filter} alerts configured.`}
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`modern-alert-item ${alert.enabled ? 'active' : 'paused'}`}
            >
              <div className="alert-meta">
                <div className="alert-name-row">
                  <span className="alert-name">{alert.name}</span>
                  <span className={`status-pill ${alert.enabled ? 'active' : 'paused'}`}>
                    {alert.enabled ? 'ACTIVE' : 'PAUSED'}
                  </span>
                </div>
                <div className="alert-condition-summary">
                  <span className="condition-type">{alert.condition_type.toUpperCase()}</span>
                  <span className="condition-direction">
                    {alert.direction === 'up' ? '▲ Above' : '▼ Below'}
                  </span>
                  <span className="condition-val">{alert.condition_value}</span>
                </div>
                {alert.fired_count > 0 && (
                  <span className="fired-badge">🔥 Triggered {alert.fired_count}x</span>
                )}
              </div>

              <div className="alert-action-controls">
                <button
                  type="button"
                  className={`toggle-icon-btn ${alert.enabled ? 'active' : 'paused'}`}
                  title={alert.enabled ? 'Pause Alert' : 'Enable Alert'}
                  onClick={() => onToggle(alert.id, !alert.enabled)}
                >
                  {alert.enabled ? '⏸' : '▶'}
                </button>
                <button
                  type="button"
                  className="delete-icon-btn"
                  title="Delete Alert"
                  onClick={() => onDelete(alert.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <CreateAlertModal
          symbol={symbol}
          currentPrice={currentPrice}
          onClose={() => setShowModal(false)}
          onSubmit={(input) => {
            onCreate(input);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateAlertModal({
  symbol,
  currentPrice,
  onClose,
  onSubmit,
}: {
  symbol: string;
  currentPrice?: number;
  onClose: () => void;
  onSubmit: (data: AlertFormInput) => void;
}) {
  const [formData, setFormData] = useState<AlertFormInput>({
    name: `${symbol} Price Alert`,
    condition_type: 'price',
    condition_value: currentPrice ? Number(currentPrice.toFixed(2)) : 0,
    direction: 'up',
    timeframe: '1h',
    notification_channels: ['browser'],
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-badge">NEW</span>
            <h3>Create Market Alert</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="alert-form">
          <div className="form-group">
            <label>Alert Description</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., BTC Breakout Resistance"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Condition Type</label>
              <select
                value={formData.condition_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    condition_type: e.target.value as AlertFormInput['condition_type'],
                  })
                }
              >
                <option value="price">Price ($)</option>
                <option value="rsi">RSI Indicator</option>
                <option value="macd_signal">MACD Signal</option>
              </select>
            </div>

            <div className="form-group">
              <label>Direction</label>
              <select
                value={formData.direction}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    direction: e.target.value as AlertFormInput['direction'],
                  })
                }
              >
                <option value="up">Crosses Above (▲)</option>
                <option value="down">Crosses Below (▼)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Trigger Threshold Value</label>
            <input
              type="number"
              step="any"
              required
              value={formData.condition_value}
              onChange={(e) =>
                setFormData({ ...formData, condition_value: parseFloat(e.target.value) || 0 })
              }
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              Activate Alert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
