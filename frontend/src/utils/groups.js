export const GROUP_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899'
};

export function parseGroupInput(str) {
  if (!str || !str.trim()) return { group_name: null, group_color: null };
  const match = str.trim().match(/^\[([A-Za-z]+)\]\s*(.+)$/);
  if (match) {
    const colorName = match[1].toLowerCase();
    const name = match[2].trim();
    if (GROUP_COLORS[colorName] && name) {
      return { group_name: name, group_color: colorName };
    }
  }
  const name = str.trim();
  return { group_name: name || null, group_color: null };
}

export function buildGroupString(group_name, group_color) {
  if (!group_name) return '';
  if (group_color && GROUP_COLORS[group_color]) {
    return `[${group_color.toUpperCase()}] ${group_name}`;
  }
  return group_name;
}
