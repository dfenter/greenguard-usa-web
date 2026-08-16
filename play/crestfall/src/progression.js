// Crestfall's persistent RPG spine: skill branches, traversal techniques,
// and equipment. The view layer reads these registries so save validation and
// content lookups have one guarded source of truth.

export const TECHNIQUES = {
  VINECUTTER: { name: 'VINECUTTER', hint: 'Climb mountain paths and cut thorn gates.', color: '#5CFF9B' },
  AIRSTEP: { name: 'AIRSTEP', hint: 'Spend a second jump in the air.', color: '#42F5E6' },
  TIDEWALK: { name: 'TIDEWALK', hint: 'Cross shallow water and drowned roads.', color: '#4D8DFF' },
  PHASESHIFT: { name: 'PHASESHIFT', hint: 'Pass sealed void gates in the keeps.', color: '#FF5CCB' },
};

export const EQUIPMENT = {
  EMBERCLOAK: { name: 'EMBER CLOAK', style: 'cloak', hint: 'A balanced field cloak.', color: '#9B6CFF' },
  THORNBINDER: { name: 'THORN BINDER', style: 'thorn', hint: 'Reduces contact damage by one.', color: '#5CFF9B' },
  SKYTHREAD: { name: 'SKYTHREAD', style: 'sky', hint: 'Attack recovery is shorter.', color: '#42F5E6' },
  TIDEGLASS: { name: 'TIDEGLASS', style: 'tide', hint: 'Rune costs are reduced by one.', color: '#4D8DFF' },
  VEILPLATE: { name: 'VEILPLATE', style: 'veil', hint: 'Extends invulnerability after a hit.', color: '#FF5CCB' },
};

export const SKILL_NODES = [
  { id: 'blade_edge', branch: 'BLADE', label: 'EDGE', detail: '+1 sword damage', cost: 1, requires: null, color: '#FF557A' },
  { id: 'blade_reprise', branch: 'BLADE', label: 'REPRISE', detail: 'faster recovery', cost: 1, requires: 'blade_edge', color: '#FF557A' },
  { id: 'blade_reach', branch: 'BLADE', label: 'LONG ARC', detail: '+4 sword reach', cost: 2, requires: 'blade_reprise', color: '#FF557A' },
  { id: 'arc_efficiency', branch: 'ARC', label: 'EFFICIENCY', detail: '-1 rune cost', cost: 1, requires: null, color: '#42F5E6' },
  { id: 'arc_burst', branch: 'ARC', label: 'BURST', detail: '+2 spell damage', cost: 1, requires: 'arc_efficiency', color: '#42F5E6' },
  { id: 'arc_overcharge', branch: 'ARC', label: 'OVERCHARGE', detail: '+2 max arc', cost: 2, requires: 'arc_burst', color: '#42F5E6' },
  { id: 'ward_shell', branch: 'WARD', label: 'SHELL', detail: '-1 damage taken', cost: 1, requires: null, color: '#FFE18A' },
  { id: 'ward_parry', branch: 'WARD', label: 'PARRY', detail: '+4 parry frames', cost: 1, requires: 'ward_shell', color: '#FFE18A' },
  { id: 'ward_heart', branch: 'WARD', label: 'HEARTFIRE', detail: '+12 max vitality', cost: 2, requires: 'ward_parry', color: '#FFE18A' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILL_NODES.map((node) => [node.id, node]));

export function hasTechnique(player, name) {
  return !!player?.techniques?.[name];
}

export function hasSkill(player, id) {
  return !!player?.skills?.[id];
}

