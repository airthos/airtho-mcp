/** Shared TypeScript interfaces for tool inputs and outputs. */

export interface DriveInfo {
  drive_id: string;
  name: string;
  drive_type: string;
}

export interface DriveItem {
  name: string;
  id: string;
  type: "file" | "folder";
  modified: string | null;
  size: number | null;
}

export interface ItemMetadata {
  name: string;
  id: string;
  type: "file" | "folder";
  modified: string | null;
  size: number | null;
  parent_id: string | null;
}

export interface SearchResult {
  name: string;
  id: string;
  path: string | null;
  modified: string | null;
  size: number | null;
}

export interface FileMetadata {
  name: string;
  id: string;
  size: number | null;
  modified: string | null;
  created: string | null;
  download_url: string | null;
  mime_type: string | null;
}

export interface FileContent {
  content: string;
  mime_type: string;
  truncated: boolean;
}

export interface McpError {
  error: string;
  message: string;
}

export type ToolResult = DriveInfo[] | DriveItem[] | ItemMetadata | SearchResult[] | FileMetadata | FileContent | McpError;

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
