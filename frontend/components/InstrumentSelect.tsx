
'use client';

import { useState, useRef, useEffect } from 'react';
import './InstrumentSelect.css';

interface InstrumentSelectProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export default function InstrumentSelect({ currentSymbol, onSelectSymbol }: InstrumentSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Initialize with current default and XAUUSD, allowing for future additions
  const [availableInstruments, setAvailableInstruments] = useState<string[]>(['XAUUSD', 'BTCUSDT', 'ETHUSDT']);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredInstruments = availableInstruments.filter((instrument) =>
    instrument.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddInstrument = (newInstrument: string) => {
    if (newInstrument && !availableInstruments.includes(newInstrument.toUpperCase())) {
      const upperNewInstrument = newInstrument.toUpperCase();
      setAvailableInstruments((prev) => [...prev, upperNewInstrument]);
      onSelectSymbol(upperNewInstrument);
      setSearchTerm('');
      setIsOpen(false);
    }
  };

  const handleSelect = (symbol: string) => {
    onSelectSymbol(symbol);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="instrument-select-wrapper" ref={menuRef}>
      <button
        type="button"
        className="instrument-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="current-symbol">{currentSymbol}</span>
        <span className="arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="instrument-dropdown-panel" role="menu">
          <input
            type="text"
            placeholder="Search or add instrument..."
            className="instrument-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchTerm) {
                handleAddInstrument(searchTerm);
              }
            }}
          />
          <div className="instrument-list">
            {filteredInstruments.length > 0 ? (
              filteredInstruments.map((instrument) => (
                <button
                  key={instrument}
                  type="button"
                  className={`instrument-item ${currentSymbol === instrument ? 'active' : ''}`}
                  onClick={() => handleSelect(instrument)}
                >
                  {instrument}
                </button>
              ))
            ) : (
              <div className="no-results">No instruments found. Press Enter to add &quot;{searchTerm}&quot;</div>
            )}
          </div>
          {searchTerm && !availableInstruments.includes(searchTerm.toUpperCase()) && (
            <button
              type="button"
              className="add-instrument-btn"
              onClick={() => handleAddInstrument(searchTerm)}
            >
              Add &quot;{searchTerm}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
