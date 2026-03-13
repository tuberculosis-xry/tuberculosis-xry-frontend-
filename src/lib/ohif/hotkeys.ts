/**
 * Viewer hotkey configuration. Override via env NEXT_PUBLIC_OHIF_HOTKEYS_JSON for deployment.
 */

export interface HotkeyBinding {
  key: string;
  alt?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  action: string;
}

export const DEFAULT_HOTKEYS: HotkeyBinding[] = [
  { key: 'r', description: 'Reset active viewport', action: 'resetViewport' },
  { key: 'r', alt: true, description: 'Reset all viewports', action: 'resetAllViewports' },
  { key: '1', description: 'Layout 1×1', action: 'layout1x1' },
  { key: '2', description: 'Layout 1×2', action: 'layout1x2' },
  { key: '3', description: 'Layout 2×2', action: 'layout2x2' },
  { key: 'w', description: 'Window/Level tool', action: 'toolWindowLevel' },
  { key: 'z', description: 'Zoom tool', action: 'toolZoom' },
  { key: 'p', description: 'Pan tool', action: 'toolPan' },
  { key: 's', description: 'Stack scroll tool', action: 'toolStackScroll' },
  { key: ' ', description: 'Play / Pause cine', action: 'cineToggle' },
  { key: 'ArrowUp', description: 'Previous slice', action: 'scrollPrev' },
  { key: 'ArrowDown', description: 'Next slice', action: 'scrollNext' },
  { key: '?', shift: true, description: 'Show keyboard shortcuts', action: 'showShortcuts' },
];

let _overrides: Partial<Record<string, HotkeyBinding>> | null = null;

/** Load hotkey overrides from env (JSON string). */
export function loadHotkeyOverrides(): void {
  if (typeof window === 'undefined') return;
  const raw = process.env.NEXT_PUBLIC_OHIF_HOTKEYS_JSON;
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as HotkeyBinding[];
    if (Array.isArray(parsed)) {
      _overrides = {};
      parsed.forEach((b) => {
        const id = [b.key, b.alt, b.ctrl, b.shift].join('-');
        _overrides![id] = b;
      });
    }
  } catch {
    _overrides = null;
  }
}

export function getHotkeys(): HotkeyBinding[] {
  if (_overrides) {
    return DEFAULT_HOTKEYS.map((h) => {
      const id = [h.key, h.alt, h.ctrl, h.shift].join('-');
      return _overrides![id] ?? h;
    });
  }
  return DEFAULT_HOTKEYS;
}

/** Format key for display (e.g. "Alt+R"). */
export function formatHotkey(b: HotkeyBinding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push('Ctrl');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  parts.push(b.key.length === 1 ? b.key.toUpperCase() : b.key);
  return parts.join('+');
}
