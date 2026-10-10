import { normalizeSystemAssistantAction } from './systemAssistantRegistry';
import type { SystemAssistantAction } from './systemAssistantTypes';

const MARKER = '<system_action';
const HIDDEN_MARKERS = [MARKER, '<tool_call', '<function_call', '<think', '```', '{', '['];

// Hold a possible marker suffix across chunks so even a one-character stream cannot flash XML.
export class SystemAssistantProtocol {
  private pending = '';
  private hidden = false;
  private sawAction = false;
  private rejectedEnvelope = false;
  readonly actions: SystemAssistantAction[] = [];
  invalid = false;

  push(delta: string): string {
    if (this.sawAction || this.rejectedEnvelope) return '';
    this.pending += delta;
    let visible = '';
    while (this.pending) {
      if (this.hidden) {
        const end = this.pending.indexOf('>');
        if (end < 0) {
          if (this.pending.length > 4096) { this.pending = ''; this.invalid = true; }
          break;
        }
        const tag = this.pending.slice(0, end + 1);
        const attrs: Record<string, string> = {};
        for (const match of tag.matchAll(/([a-zA-Z_][\w-]*)\s*=\s*["']([^"']*)["']/g)) {
          attrs[match[1]] = match[2];
        }
        const action = normalizeSystemAssistantAction(attrs);
        if (action && /^<system_action\s/i.test(tag) && /\/\s*>$/.test(tag) && !this.sawAction) this.actions.push(action);
        else this.invalid = true;
        this.sawAction = true;
        // Protocol must be last. Drop any trailing payload, including malformed XML bodies.
        this.pending = '';
        break;
      }
      const lower = this.pending.toLowerCase();
      const found = HIDDEN_MARKERS.map(marker => ({ marker, index: lower.indexOf(marker) }))
        .filter(entry => entry.index >= 0).sort((a, b) => a.index - b.index)[0];
      const start = found?.index ?? -1;
      if (start >= 0) {
        visible += this.pending.slice(0, start);
        if (found.marker !== MARKER) {
          this.invalid = true;
          this.rejectedEnvelope = true;
          this.pending = '';
          break;
        }
        this.pending = this.pending.slice(start);
        this.hidden = true;
        continue;
      }
      let held = 0;
      for (let length = 1; length < MARKER.length && length <= this.pending.length; length++) {
        if (HIDDEN_MARKERS.some(marker => marker.startsWith(this.pending.slice(-length).toLowerCase()))) held = length;
      }
      visible += this.pending.slice(0, this.pending.length - held);
      this.pending = this.pending.slice(this.pending.length - held);
      break;
    }
    return visible;
  }

  finish(): string {
    if (this.hidden) {
      if (!this.sawAction) this.invalid = true;
      this.pending = '';
      return '';
    }
    const tail = this.pending;
    this.pending = '';
    // A partial marker is internal content, including a truncated final '<'.
    return tail && HIDDEN_MARKERS.some(marker => marker.startsWith(tail.toLowerCase())) ? '' : tail;
  }
}

export function sanitizeSystemAssistantContent(content: string): string {
  const parser = new SystemAssistantProtocol();
  return (parser.push(content) + parser.finish()).trimEnd();
}
