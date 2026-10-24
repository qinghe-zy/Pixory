export type SandboxInitialMode = 'drawer' | 'fullscreen';

export type SandboxTrack = 'chat' | 'modify' | 'create';

export interface SandboxArtifact {
  id: string;
  title: string;
  language: string;
  code: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type SandboxConsoleEventType = 'CONSOLE_LOG' | 'CONSOLE_ERROR' | 'CDN_LOAD_ERROR';

export interface SandboxConsoleEvent {
  id: string;
  type: SandboxConsoleEventType;
  message: string;
  line?: number;
  col?: number;
  stack?: string | null;
  src?: string;
  timestamp: number;
}

export interface SearchReplaceDiffBlock {
  search: string;
  replace: string;
}

export interface SearchReplaceResult {
  success: boolean;
  result: string;
  replacedBlocks: number;
  error?: string;
}

export interface SandboxAssemblyResult {
  html: string;
  baseUrl: string;
  artifactId: string;
  title: string;
}
