export function appendJsonPointer(basePath: string, segment: string): string {
  const escapedSegment = segment.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${basePath}/${escapedSegment}`;
}

export function readPointerFieldName(path: string): string | undefined {
  const segments = path.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);

  if (lastSegment === undefined || /^\d+$/.test(lastSegment)) {
    return undefined;
  }

  return lastSegment.replaceAll("~1", "/").replaceAll("~0", "~");
}

export function isLinkPath(path: string): boolean {
  return /^\/links\/\d+$/.test(path);
}

export function isLinkTargetPath(path: string): boolean {
  return /^\/links\/\d+\/target$/.test(path);
}
