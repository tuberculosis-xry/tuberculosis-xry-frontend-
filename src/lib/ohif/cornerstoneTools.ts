/**
 * Interactive tools using @cornerstonejs/core viewport API only (no @cornerstonejs/tools).
 * Tool state is used by ViewportGrid to attach the correct mouse/wheel behavior.
 */

export const TOOL_NAMES = {
  WindowLevel: 'WindowLevel',
  Zoom: 'Zoom',
  Pan: 'Pan',
  StackScroll: 'StackScroll',
  Length: 'Length',
  Angle: 'Angle',
  RectangleROI: 'RectangleROI',
  EllipticalROI: 'EllipticalROI',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

/** No-op for API compatibility; actual behavior is in ViewportGrid mouse handlers. */
export function setActiveTool(toolName: string): void {
  void toolName;
}

/** No-op; tool group is not used when using core-only tools. */
export function setToolGroupViewports(viewportIds: string[], renderingEngineId?: string): void {
  void viewportIds;
  void renderingEngineId;
}

/** No-op. */
export function removeToolGroupViewports(renderingEngineId?: string): void {
  void renderingEngineId;
}

export function isToolsInitialized(): boolean {
  return true;
}
