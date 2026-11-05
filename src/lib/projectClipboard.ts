import type { Cable, Jumper, ProjectFolder } from '../types/cable';
import { uid } from '../types/cable';
import type { TreeEntity } from '../components/ProjectTree';

const CLIPBOARD_KEY = 'cable-designer-clipboard-v1';

export interface ProjectClipboard {
  app: 'cable-designer-clipboard';
  version: 1;
  mode: 'copy' | 'cut';
  entity: TreeEntity;
  folder?: ProjectFolder;
  cables: Cable[];
}

function cloneJumpers(items?: Jumper[]): Jumper[] | undefined {
  return items?.map((jumper) => ({ ...jumper, id: uid(), chains: cloneJumpers(jumper.chains) ?? [] }));
}

export function cloneCable(cable: Cable, folderId: string | null, suffix = ''): Cable {
  return {
    ...cable,
    id: uid(),
    folderId,
    designation: `${cable.designation}${suffix}`,
    wires: cable.wires.map((wire) => ({
      ...wire,
      id: uid(),
      jumpersA: cloneJumpers(wire.jumpersA),
      jumpersB: cloneJumpers(wire.jumpersB),
    })),
    columns: cable.columns.map((column) => ({ ...column, id: uid() })),
  };
}

export function writeProjectClipboard(payload: Omit<ProjectClipboard, 'app' | 'version'>) {
  const value: ProjectClipboard = { app: 'cable-designer-clipboard', version: 1, ...payload };
  // localStorage общий для всех окон приложения: копия доступна в другом проекте.
  localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(value));
}

export function readProjectClipboard(): ProjectClipboard | null {
  try {
    const value = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || 'null');
    if (value?.app !== 'cable-designer-clipboard' || value?.version !== 1 || !Array.isArray(value.cables)) return null;
    return value as ProjectClipboard;
  } catch {
    return null;
  }
}
