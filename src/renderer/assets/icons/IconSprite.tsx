/**
 * 官方图标 sprite：把 ui-theme 维护的全部图标作为 <symbol> 注入文档，
 * 供 `Icon*Outline*` 组件通过 <use href="#dsw-icon-..."> 引用。
 * 行为与官方 dsh-client-ui-primitives 一致（图标继承 currentColor / CSS 变量）。
 */
import React from 'react';
import { ICON_SYMBOLS } from './artwork';

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
      {Object.entries(ICON_SYMBOLS).map(([id, svgDoc]) => (
        <symbol
          key={id}
          id={id}
          dangerouslySetInnerHTML={{ __html: svgDoc.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') }}
        />
      ))}
    </svg>
  );
}
