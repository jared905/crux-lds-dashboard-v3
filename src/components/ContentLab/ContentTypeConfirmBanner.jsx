import React, { useState } from 'react';
import { CheckCircle, ChevronDown } from 'lucide-react';

const TYPE_LABELS = {
  faith: 'Faith / Sermon',
  brand: 'Brand / Marketing',
  thought_leadership: 'Thought Leadership',
  documentary: 'Documentary / Narrative',
  entertainment: 'Entertainment / Personality',
  kids: 'Made for Kids',
  tutorial: 'Tutorial / How-To',
  interview: 'Interview / Podcast',
};

const ALL_TYPES = Object.keys(TYPE_LABELS);

export default function ContentTypeConfirmBanner({ detectedType, confidence, onConfirm, onDismiss }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedType, setSelectedType] = useState(detectedType);

  if (!detectedType) return null;

  const handleConfirm = () => {
    onConfirm(selectedType);
  };

  const handleSelect = (type) => {
    setSelectedType(type);
    setShowDropdown(false);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 16px', marginBottom: '12px',
      background: '#1a1a2e', border: '1px solid #2a2a4a',
      borderRadius: '8px', fontSize: '12px',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ color: '#888' }}>Detected content type:</span>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', background: '#252545', border: '1px solid #3b3b6b',
              borderRadius: '4px', color: '#a78bfa', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {TYPE_LABELS[selectedType] || selectedType}
            <ChevronDown size={12} />
          </button>
          {showDropdown && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: '4px',
              background: '#1e1e3a', border: '1px solid #3b3b6b', borderRadius: '6px',
              zIndex: 100, minWidth: '200px', overflow: 'hidden',
            }}>
              {ALL_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => handleSelect(type)}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px',
                    background: type === selectedType ? '#2a2a5a' : 'transparent',
                    border: 'none', color: type === selectedType ? '#a78bfa' : '#ccc',
                    fontSize: '12px', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
        {confidence != null && (
          <span style={{ color: '#555', fontSize: '10px' }}>
            ({Math.round(confidence * 100)}% confidence)
          </span>
        )}
        <span style={{ color: '#666' }}>Sound right?</span>
      </div>
      <button
        onClick={handleConfirm}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '5px 14px', background: '#7c3aed', border: 'none',
          borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: '600',
          cursor: 'pointer',
        }}
      >
        <CheckCircle size={12} />
        Confirm
      </button>
      <button
        onClick={onDismiss}
        style={{
          padding: '5px 10px', background: 'transparent', border: '1px solid #444',
          borderRadius: '5px', color: '#666', fontSize: '11px', cursor: 'pointer',
        }}
      >
        Skip
      </button>
    </div>
  );
}
