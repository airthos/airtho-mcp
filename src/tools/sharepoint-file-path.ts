export function cleanSharePointPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

export function joinSharePointPath(directoryPath: string, filename: string): string {
  const cleanDirectory = cleanSharePointPath(directoryPath);
  const cleanFilename = filename.replace(/\\/g, "/").split("/").filter(Boolean).pop()?.trim();

  if (!cleanFilename) {
    throw new Error("filename must include a file name");
  }

  return cleanDirectory ? `${cleanDirectory}/${cleanFilename}` : cleanFilename;
}

export function encodeSharePointPath(path: string): string {
  return cleanSharePointPath(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}
