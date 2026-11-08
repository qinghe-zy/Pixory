import type { IRagComponent } from '../../core/lifecycle';

export interface ParsedDocument {
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IDocumentParser extends IRagComponent {
  readonly kind: 'parser';
  readonly supportedExtensions: string[];
  parse(raw: string | ArrayBuffer, filename?: string): Promise<ParsedDocument>;
}
