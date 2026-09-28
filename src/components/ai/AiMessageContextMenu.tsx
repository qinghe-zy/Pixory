import type { ComponentProps } from 'react';

import {
  AnchoredContextMenu,
  type AnchoredContextMenuAction,
} from '../AnchoredContextMenu';

export type AiMessageContextMenuAction = AnchoredContextMenuAction;

export function AiMessageContextMenu(
  props: Omit<ComponentProps<typeof AnchoredContextMenu>, 'dismissAccessibilityLabel'>,
) {
  return (
    <AnchoredContextMenu
      {...props}
      dismissAccessibilityLabel="关闭消息操作菜单"
    />
  );
}


