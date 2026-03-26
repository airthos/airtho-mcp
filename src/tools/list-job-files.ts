/**
 * Shared fallback for job-scoped file search.
 * Graph search() scoped to a folder is unreliable — this lists children
 * 2 levels deep and filters files by keyword in the name.
 */

import type { Client } from "@microsoft/microsoft-graph-client";
import type { GraphItem } from "../types.js";

/**
 * List files in a folder (2 levels deep) matching a keyword in the filename.
 * Returns all matches sorted by relevance (exact > partial).
 */
export async function listJobFiles(
  client: Client,
  driveId: string,
  folderId: string,
  keyword: string,
  folderName: string,
): Promise<GraphItem[]> {
  const kw = keyword.toLowerCase();

  const topResp = await client
    .api(`/drives/${driveId}/items/${folderId}/children?$top=200`)
    .get() as { value: GraphItem[] };
  const topItems = topResp.value ?? [];

  // Fetch one level of subfolders in parallel
  const subFolders = topItems.filter((i) => !!i.folder);
  const subResults = await Promise.all(
    subFolders.map(async (folder) => {
      try {
        const resp = await client
          .api(`/drives/${driveId}/items/${folder.id}/children?$top=200`)
          .get() as { value: GraphItem[] };
        return (resp.value ?? []).map((item) => ({
          ...item,
          parentReference: {
            ...item.parentReference,
            name: `${folderName}/${folder.name}`,
          },
        }));
      } catch {
        return [] as GraphItem[];
      }
    }),
  );

  const allFiles = [
    ...topItems.filter((i) => !i.folder),
    ...subResults.flat().filter((i) => !i.folder),
  ];

  return allFiles.filter((f) => f.name.toLowerCase().includes(kw));
}
