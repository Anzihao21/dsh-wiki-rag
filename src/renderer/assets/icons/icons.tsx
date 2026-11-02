/**
 * DSH 官方产品图标集（复刻自官方 ui-primitives）。
 * 命名与渲染行为与官方完全一致：Icon<Glyph>OutlineRegular / Medium，
 * 颜色继承 currentColor，尺寸由 size prop 控制。
 * 在 DSH 宿主内运行时，可直接替换为官方 `@deepseek-ai/dsh-client-ui-primitives`。
 */
import React from 'react';
import { ICON_ARTWORK, ICON_REGULAR_STROKE, ICON_MEDIUM_STROKE, type IconGlyph, type IconWeight } from './artwork';

export interface IconProps {
  /** Square edge in px; defaults to the glyph's own drawn size. */
  size?: number;
  /** Extra class for layout placement; color rides currentColor. */
  className?: string;
}

function productIcon(glyph: IconGlyph, weight: IconWeight): (props: IconProps) => React.JSX.Element {
  const art = ICON_ARTWORK[glyph] as { size: number; aspect?: readonly [number, number]; svg: (s: number) => string };
  const defaultSize = art.size;
  const aspect: readonly [number, number] = art.aspect ?? [1, 1];
  return ({ size = defaultSize, className }: IconProps) => (
    <svg width={(size * aspect[0]) / aspect[1]} height={size} className={className} aria-hidden="true">
      <use href={`#dsw-icon-${glyph}-${weight}`} />
    </svg>
  );
}

export const IconSaveOutlineRegular = productIcon('save-outline', 'regular');
export const IconSaveOutlineMedium = productIcon('save-outline', 'medium');
export const IconSearchOutlineRegular = productIcon('search-outline', 'regular');
export const IconSearchOutlineMedium = productIcon('search-outline', 'medium');
export const IconGlobeOutlineRegular = productIcon('globe-outline', 'regular');
export const IconGlobeOutlineMedium = productIcon('globe-outline', 'medium');
export const IconSettingsOutlineRegular = productIcon('settings-outline', 'regular');
export const IconSettingsOutlineMedium = productIcon('settings-outline', 'medium');
export const IconPanelLeftOutlineRegular = productIcon('panel-left-outline', 'regular');
export const IconPanelLeftOutlineMedium = productIcon('panel-left-outline', 'medium');
export const IconEllipsisOutlineRegular = productIcon('ellipsis-outline', 'regular');
export const IconEllipsisOutlineMedium = productIcon('ellipsis-outline', 'medium');
export const IconPlusOutlineRegular = productIcon('plus-outline', 'regular');
export const IconPlusOutlineMedium = productIcon('plus-outline', 'medium');
export const IconCheckOutlineRegular = productIcon('check-outline', 'regular');
export const IconCheckOutlineMedium = productIcon('check-outline', 'medium');
export const IconChevronDownOutlineRegular = productIcon('chevron-down-outline', 'regular');
export const IconChevronDownOutlineMedium = productIcon('chevron-down-outline', 'medium');
export const IconChevronLeftOutlineRegular = productIcon('chevron-left-outline', 'regular');
export const IconChevronRightOutlineRegular = productIcon('chevron-right-outline', 'regular');
export const IconChevronUpOutlineRegular = productIcon('chevron-up-outline', 'regular');
export const IconCloseOutlineRegular = productIcon('close-outline', 'regular');
export const IconCloseOutlineMedium = productIcon('close-outline', 'medium');
export const IconRefreshOutlineRegular = productIcon('refresh-outline', 'regular');
export const IconRefreshOutlineMedium = productIcon('refresh-outline', 'medium');
export const IconTrashOutlineRegular = productIcon('trash-outline', 'regular');
export const IconTrashOutlineMedium = productIcon('trash-outline', 'medium');
export const IconEditOutlineRegular = productIcon('edit-outline', 'regular');
export const IconEditOutlineMedium = productIcon('edit-outline', 'medium');
export const IconFolderOpenOutlineRegular = productIcon('folder-open-outline', 'regular');
export const IconFolderOpenOutlineMedium = productIcon('folder-open-outline', 'medium');
export const IconLinkOutlineRegular = productIcon('link-outline', 'regular');
export const IconLinkOutlineMedium = productIcon('link-outline', 'medium');
export const IconWarningTriangleOutlineRegular = productIcon('warning-triangle-outline', 'regular');
export const IconWarningTriangleOutlineMedium = productIcon('warning-triangle-outline', 'medium');
export const IconArchiveOutlineRegular = productIcon('archive-outline', 'regular');
export const IconArchiveOutlineMedium = productIcon('archive-outline', 'medium');
export const IconListPenOutlineRegular = productIcon('list-pen-outline', 'regular');
export const IconListPenOutlineMedium = productIcon('list-pen-outline', 'medium');
export const IconLoadingOutlineRegular = productIcon('loading-outline', 'regular');
export const IconLoadingOutlineMedium = productIcon('loading-outline', 'medium');
export const IconDatabaseOutlineRegular = productIcon('database-outline', 'regular');
export const IconDatabaseOutlineMedium = productIcon('database-outline', 'medium');
export const IconInfoOutlineRegular = productIcon('info-outline', 'regular');
export const IconInfoOutlineMedium = productIcon('info-outline', 'medium');
export const IconDownloadOutlineRegular = productIcon('download-outline', 'regular');
export const IconDownloadOutlineMedium = productIcon('download-outline', 'medium');
export const IconShareOutlineRegular = productIcon('share-outline', 'regular');
export const IconShareOutlineMedium = productIcon('share-outline', 'medium');
export const IconCheckCircleOutlineRegular = productIcon('check-circle-outline', 'regular');
export const IconCheckCircleOutlineMedium = productIcon('check-circle-outline', 'medium');
export const IconNewChatOutlineRegular = productIcon('new-chat-outline', 'regular');
export const IconNewChatOutlineMedium = productIcon('new-chat-outline', 'medium');
export const IconBranchOutlineRegular = productIcon('branch-outline', 'regular');
export const IconCloseCircleFillRegular = productIcon('close-circle-fill', 'regular');
