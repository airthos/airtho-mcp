/** Shared TypeScript interfaces for tool inputs and outputs. */

export interface McpError {
  error: string;
  message: string;
}

// Raw Graph API response shapes (used internally for type-safe parsing)
export interface GraphDrive {
  id: string;
  name: string;
  driveType: string;
}

export interface GraphItem {
  id: string;
  name: string;
  folder?: Record<string, unknown>;
  file?: { mimeType: string };
  lastModifiedDateTime?: string;
  createdDateTime?: string;
  size?: number;
  parentReference?: { id?: string; path?: string };
  "@microsoft.graph.downloadUrl"?: string;
}
