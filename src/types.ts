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
  parentReference?: { id?: string; path?: string; name?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

export interface GraphListColumn {
  id: string;
  name: string;
  displayName: string;
  hidden?: boolean;
  readOnly?: boolean;
  required?: boolean;
  text?: Record<string, unknown>;
  number?: Record<string, unknown>;
  dateTime?: Record<string, unknown>;
  choice?: { choices?: string[]; allowTextEntry?: boolean };
  boolean?: Record<string, unknown>;
  lookup?: Record<string, unknown>;
  personOrGroup?: Record<string, unknown>;
  currency?: Record<string, unknown>;
  calculated?: Record<string, unknown>;
  hyperlink?: Record<string, unknown>;
}

export interface GraphList {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  list?: { hidden?: boolean; template?: string };
  columns?: GraphListColumn[];
}

export interface GraphListItem {
  id: string; // SharePoint integer ID as string (e.g. "5") — NOT a GUID
  fields?: Record<string, unknown>;
}
