import type { ComponentProps } from 'react';

import {
  AiAnchoredContextMenu,
  type AiAnchoredContextMenuAction,
} from './AiAnchoredContextMenu';

export type AiMessageContextMenuAction = AiAnchoredContextMenuAction;

export function AiMessageContextMenu(
  props: Omit<ComponentProps<typeof AiAnchoredContextMenu>, 'dismissAccessibilityLabel'>,
) {
  return (
    <AiAnchoredContextMenu
      {...props}
      dismissAccessibilityLabel="关闭消息操作菜单"
    />
  );
}
