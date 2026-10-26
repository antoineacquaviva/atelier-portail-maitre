export type ServiceStatus = 'active' | 'stopped' | 'deploying' | 'standby';

export interface ServiceItem {
  id: string;
  name: string;
  shortDesc: string;
  repo: string;
  branch: string;
  commitHash: string;
  commitMsg: string;
  lastSync: string;
  subpath: string;
  port: number;
  systemdUnit: string;
  vmPath: string;
  winPath: string;
  ubuntuPath: string;
  techStack: string;
  cpuAllocation: string;
  status: ServiceStatus;
  pid: number | null;
  uptime: string;
  memoryMb: number;
  versionTag: string;
  subpathReady: boolean;
  logs: string[];
}

export interface VmInfo {
  name: string;
  publicIp: string;
  privateIp: string;
  domain: string;
  shape: string;
  ocpuCount: number;
  vcpuCount: number;
  ramGb: number;
  availabilityDomain: string;
  osUser: string;
  osDistro: string;
  executionMode: 'production-vm' | 'preview-sandbox';
  cpuLoadPercent: number;
  reservedWebVcpu: number;
  workerVcpuPool: number;
  ramUsedGb: number;
}

export interface LoraV2File {
  relativePath: string;
  fileName: string;
  category: 'backend' | 'orchestration-oci' | 'frontend' | 'config';
  sizeBytes: number;
  lineCount: number;
  summary: string;
  v2Changes: string;
  content: string;
  subpathPatchedContent?: string;
}

export interface OverviewResponse {
  vmInfo: VmInfo;
  services: ServiceItem[];
  step1Completed: boolean;
}
