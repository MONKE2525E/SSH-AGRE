import React from 'react';
import { GROUP_COLORS, buildGroupString, parseGroupInput } from '../utils/groups';

function GroupInput({ value, onChange, existingGroups, datalistId }) {
  const { group_color: previewColor } = parseGroupInput(value);
  const dotHex = previewColor ? GROUP_COLORS[previewColor] : null;

  return (
    <div className="form-group">
      <label>
        Group{' '}
        <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>(optional)</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {dotHex && (
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: dotHex,
            flexShrink: 0
          }} />
        )}
        <input
          type="text"
          className="form-input"
          style={{ flex: 1 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., [YELLOW] Production"
          list={datalistId}
        />
      </div>
      <datalist id={datalistId}>
        {(existingGroups || []).map(g => (
          <option key={g.name} value={buildGroupString(g.name, g.color)} />
        ))}
      </datalist>
      <span className="form-hint">
        Prefix with a color in brackets for a dot — RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, PINK
      </span>
    </div>
  );
}

export default GroupInput;
