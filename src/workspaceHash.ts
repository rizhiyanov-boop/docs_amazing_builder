import type { WorkspaceProjectData } from './types';

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashWorkspace(workspace: WorkspaceProjectData): string {
  return fnv1a32(JSON.stringify(workspace));
}
