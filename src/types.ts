export type ToolStatus = 'active' | 'stopped' | 'standby';

export type StackPreset = 'fastapi' | 'flask' | 'node' | 'static-python' | 'custom';

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  repo: string; // e.g., "antoineacquaviva/lora-factory"
  branch: string;
  commitHash: string;
  lastUpdated: string;
  lastSource: 'git' | 'zip';
  subpath: string; // e.g., "/lora"
  port: number;
  systemdUnit: string; // e.g., "lora-studio.service"
  vmPath: string; // e.g., "/home/opc/lora-factory" or "/srv/jeu/foret-automate-lab"
  stackPreset: StackPreset;
  execStart: string;
  buildCmd: string;
  status: ToolStatus;
  logs: string[];
}

export interface PortalSelfInfo {
  repo: string;
  vmPath: string;
  systemdUnit: string;
  commitHash: string;
  lastUpdated: string;
  domain: string;
  publicIp: string;
  executionMode: 'production-vm' | 'preview-sandbox';
}

export interface VmPrerequisites {
  sshPublicKey: string;
  sudoersConfigured: boolean;
  sudoersCommand: string;
}

export interface OverviewData {
  portal: PortalSelfInfo;
  tools: ToolItem[];
  prereqs: VmPrerequisites;
}

export interface DeployVersionRequest {
  source: 'git' | 'zip';
  zipBase64?: string;
  zipFileName?: string;
  commitMessage?: string;
  autoSubpathPatch?: boolean;
}

export interface CreateToolRequest {
  name: string;
  id: string;
  description: string;
  subpath: string;
  port: number;
  repo: string;
  stackPreset: StackPreset;
  execStart: string;
  buildCmd: string;
  initialSource: 'git' | 'zip';
  zipBase64?: string;
  zipFileName?: string;
  autoSubpathPatch?: boolean;
}
