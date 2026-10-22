'use client';

import { useState, useRef, useEffect } from 'react';

export interface IndicatorStates {
  showEMA20: boolean;
  showEMA50: boolean;
  showEMA200: boolean;
  showSupportResistance: boolean;
  showPatterns: boolean;
  showVolume: boolean;
}

interface IndicatorMenuProps {
  indicators: IndicatorStates;
  onToggle?: (key: keyof IndicatorStates, value: boolean) => void;
  onChange?: (key: keyof IndicatorStates, value: boolean) => void;
}

export default function IndicatorMenu({ indicators, onToggle, onChange }: IndicatorMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const handleToggle = onToggle || onChange || (() => {});

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeCount = Object.values(indicators).filter(Boolean).length;

  return (
    <div className="indicator-menu-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`indicator-toggle-trigger ${isOpen ? 'open' : ''} ${activeCount > 0 ? 'has-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="icon">⚡</span>
        <span>Indicators</span>
        <span className="badge">{activeCount}</span>
        <span className="arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="indicator-dropdown-panel" role="menu">
          <div className="indicator-dropdown-header">
            <span>Chart Overlays</span>
            <button
              type="button"
              className="indicator-reset-btn"
              onClick={() => {
                handleToggle('showEMA20', true);
                handleToggle('showEMA50', true);
                handleToggle('showEMA200', true);
                handleToggle('showSupportResistance', true);
                handleToggle('showPatterns', true);
                handleToggle('showVolume', true);
              }}
            >
              Reset All
            </button>
          </div>

          <div className="indicator-group">
            <span className="group-title">Moving Averages</span>
            <label className="indicator-item">
              <span className="color-dot ema20" />
              <span className="name">EMA 20</span>
              <input
                type="checkbox"
                checked={indicators.showEMA20}
                onChange={(e) => handleToggle('showEMA20', e.target.checked)}
              />
            </label>
            <label className="indicator-item">
              <span className="color-dot ema50" />
              <span className="name">EMA 50</span>
              <input
                type="checkbox"
                checked={indicators.showEMA50}
                onChange={(e) => handleToggle('showEMA50', e.target.checked)}
              />
            </label>
            <label className="indicator-item">
              <span className="color-dot ema200" />
              <span className="name">EMA 200</span>
              <input
                type="checkbox"
                checked={indicators.showEMA200}
                onChange={(e) => handleToggle('showEMA200', e.target.checked)}
              />
            </label>
          </div>

          <div className="indicator-group">
            <span className="group-title">Structure & Analysis</span>
            <label className="indicator-item">
              <span className="color-dot sr" />
              <span className="name">Support / Resistance</span>
              <input
                type="checkbox"
                checked={indicators.showSupportResistance}
                onChange={(e) => handleToggle('showSupportResistance', e.target.checked)}
              />
            </label>
            <label className="indicator-item">
              <span className="color-dot patterns" />
              <span className="name">Pattern Markers</span>
              <input
                type="checkbox"
                checked={indicators.showPatterns}
                onChange={(e) => handleToggle('showPatterns', e.target.checked)}
              />
            </label>
            <label className="indicator-item">
              <span className="color-dot volume" />
              <span className="name">Volume Profile</span>
              <input
                type="checkbox"
                checked={indicators.showVolume}
                onChange={(e) => handleToggle('showVolume', e.target.checked)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
