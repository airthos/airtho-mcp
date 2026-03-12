import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";
import { resolveDrive } from "./resolve-drive.js";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/xml",
  "text/javascript",
  "application/json",
  "application/xml",
  "application/javascript",
]);

const WORD_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface ReadResult {
  drive_name: string;
  file_name: string;
  content: string;
  mime_type: string;
  truncated: boolean;
}

interface ReadUnsupported {
  drive_name: string;
  file_name: string;
  error: "unsupported_format";
  message: string;
  mime_type: string;
  download_url: string | null;
}

/**
 * Extract plain text from a .docx buffer by parsing the ZIP and reading
 * word/document.xml. Uses only Node built-ins (no external ZIP library).
 */
function extractDocxText(buf: Buffer): string {
  // .docx is a ZIP file. We walk the central directory to find word/document.xml
  // then inflate it and strip XML tags.
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Find End of Central Directory record (scan backwards for signature 0x06054b50)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP/DOCX file");

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdEntries = view.getUint16(eocdOffset + 10, true);

  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;

    const compMethod = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const uncompSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);

    if (name === "word/document.xml") {
      // Read local file header to find data start
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressed = buf.subarray(dataStart, dataStart + compSize);

      let xml: string;
      if (compMethod === 0) {
        // Stored (no compression)
        xml = compressed.toString("utf8");
      } else {
        // Deflated — use raw inflate (no zlib header)
        const inflated = inflateRawSync(compressed, uncompSize);
        xml = inflated.toString("utf8");
      }

      // Strip XML tags, collapse whitespace, add paragraph breaks
      return xml
        .replace(/<w:p[\s>]/g, "\n<w:p ")  // paragraph breaks
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .replace(/ \n /g, "\n")
        .trim();
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("word/document.xml not found in DOCX");
}

/** Synchronous raw inflate using zlib. */
function inflateRawSync(data: Buffer, expectedSize: number): Buffer {
  const { inflateRawSync: zInflate } = require("node:zlib") as typeof import("node:zlib");
  return zInflate(data);
}

export async function read(args: {
  drive_name: string;
  path?: string;
  item_id?: string;
}): Promise<ReadResult | ReadUnsupported | McpError> {
  const { drive_name, path, item_id } = args;

  if (!path && !item_id) {
    return { error: "invalid_input", message: "Provide either 'path' or 'item_id'" };
  }

  // Resolve drive
  const resolved = await resolveDrive(drive_name);
  if ("error" in resolved) return resolved;
  const { driveId, driveName } = resolved;

  const client = getGraphClient();

  try {
    // Get the file item — either by path or item_id
    let item: GraphItem;
    if (item_id) {
      item = await client.api(`/drives/${driveId}/items/${item_id}`).get() as GraphItem;
    } else {
      const cleanPath = path!.replace(/^\/+/, "");
      item = await client
        .api(`/drives/${driveId}/root:/${encodeURI(cleanPath)}`)
        .get() as GraphItem;
    }

    if (!item.file) {
      return { error: "not_a_file", message: `'${item.name}' is a folder, not a file. Use airtho_browse to list its contents.` };
    }

    const mimeType = item.file.mimeType ?? "application/octet-stream";
    const downloadUrl: string | undefined = item["@microsoft.graph.downloadUrl"];

    if (!downloadUrl) {
      return { error: "content_unavailable", message: `No download URL available for '${item.name}'` };
    }

    // Plain text files: fetch directly from the pre-authenticated download URL
    if (TEXT_MIME_TYPES.has(mimeType)) {
      const response = await fetch(downloadUrl);
      const text = await response.text();
      const truncated = text.length > CHARACTER_LIMIT;
      return {
        drive_name: driveName,
        file_name: item.name,
        content: truncated ? text.slice(0, CHARACTER_LIMIT) : text,
        mime_type: mimeType,
        truncated,
      };
    }

    // Word documents: download raw .docx and extract text from word/document.xml
    if (mimeType === WORD_MIME_TYPE) {
      try {
        const response = await fetch(downloadUrl);
        const arrayBuf = await response.arrayBuffer();
        const text = extractDocxText(Buffer.from(arrayBuf));
        const truncated = text.length > CHARACTER_LIMIT;
        return {
          drive_name: driveName,
          file_name: item.name,
          content: truncated ? text.slice(0, CHARACTER_LIMIT) : text,
          mime_type: "text/plain",
          truncated,
        };
      } catch {
        // Fall through to unsupported format with download URL
      }
    }

    // Unsupported format — return download URL so Claude can share it with the user
    return {
      drive_name: driveName,
      file_name: item.name,
      error: "unsupported_format",
      message: `Cannot extract text from '${mimeType}'. Share the download link with the user instead.`,
      mime_type: mimeType,
      download_url: downloadUrl,
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "not_found", message: `File '${path ?? item_id}' not found in drive '${driveName}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
