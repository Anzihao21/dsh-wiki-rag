/**
 * dsh-wiki-rag 官方一致 UI 组件库。
 * 复刻自 DeepSeek Harness 官方 `@deepseek-ai/dsh-client-ui-primitives`：
 * 全部样式只消费官方设计令牌 var(--dsw-alias-*) / var(--dsw-specific-*) / var(--dsw-static-*)，
 * 明暗主题由宿主 body[data-ds-dark-theme] 级联自动切换，禁止任何 JS 主题切换或 hex 字面量。
 */
import React, {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from './i18n';
import {
  IconCheckCircleOutlineRegular,
  IconCheckOutlineRegular,
  IconCloseOutlineRegular,
  IconLoadingOutlineMedium,
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular,
} from './assets/icons/icons';

/* ============ 按钮 ============ */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type ButtonSize = 'default' | 'sm' | 'xs';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'default',
  leadingIcon,
  trailingIcon,
  loading,
  children,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const cls = [
    'dsw-btn',
    `dsw-btn-${variant}`,
    `dsw-btn-${size}`,
    className
  ].join(' ');
  const isDisabled = disabled || loading;
  return (
    <button className={cls} disabled={isDisabled} {...rest}>
      {loading && <IconLoadingOutlineMedium size={16} className="dsw-btn-icon" />}
      {!loading && leadingIcon && <span className="dsw-btn-icon">{leadingIcon}</span>}
      {children}
      {trailingIcon && <span className="dsw-btn-icon">{trailingIcon}</span>}
    </button>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
}

export function IconButton({ variant = 'ghost', size = 'default', label, children, className = '', title: _title, ...rest }: IconButtonProps) {
  return (
    <Tooltip label={label} side="top">
      <button className={`dsw-btn dsw-btn-${variant} dsw-btn-${size} dsw-btn-icon-only ${className}`} aria-label={label} {...rest}>
        {children}
      </button>
    </Tooltip>
  );
}

/* ============ 分段切换器（Tabs） ============ */
export interface TabItem {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  size?: 'default' | 'sm';
}

export function Tabs({ items, activeId, onChange, size = 'default' }: TabsProps) {
  return (
    <div className="dsw-tabs" role="tablist" data-size={size}>
      {items.map((it) => {
        const selected = it.id === activeId;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={selected}
            aria-disabled={it.disabled}
            disabled={it.disabled}
            className="dsw-tab"
            onClick={() => onChange(it.id)}
          >
            {it.label}
            {it.badge != null && <span className="dsw-tab-badge">{it.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ============ 输入框 / 搜索框 / 下拉 ============ */
export interface InputFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  prefix?: ReactNode;
  hint?: string;
  error?: string;
}

export function InputField({ label, prefix, hint, error, className = '', ...rest }: InputFieldProps) {
  return (
    <label className="dsw-field">
      {label && <span className="dsw-field-label">{label}</span>}
      <span className={`dsw-input ${error ? 'dsw-input-error' : ''}`}>
        {prefix && <span className="dsw-input-icon">{prefix}</span>}
        <input className={`dsw-input-field ${className}`} {...rest} />
      </span>
      {hint && !error && <span className="dsw-field-hint">{hint}</span>}
      {error && <span className="dsw-field-error">{error}</span>}
    </label>
  );
}

export function SearchField({
  placeholder = t('common.search'),
  shortcut,
  onValueChange,
  ...rest
}: {
  placeholder?: string;
  shortcut?: string;
  onValueChange?: (v: string) => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="dsw-input dsw-search">
      <span className="dsw-input-icon"><IconSearchOutlineRegular size={16} /></span>
      <input
        className="dsw-input-field"
        placeholder={placeholder}
        onChange={(e) => onValueChange?.(e.target.value)}
        {...rest}
      />
      {shortcut && <span className="dsw-shortcut">{shortcut}</span>}
    </span>
  );
}

/* 下拉：复刻官方 Menu 浮层（触发器 + portal 浮层，hover/选中态/键盘可达） */
export interface DropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export function DropdownSelect({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null);
  const selected = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const MARGIN = 12;
    const vh = window.innerHeight;
    // 依据可见项估算高度，空间不足时翻转到触发器上方
    const estH = Math.min(options.length, 8) * 34 + 12;
    let top = r.bottom + 4;
    if (top + estH > vh - MARGIN) top = Math.max(MARGIN, r.top - estH - 4);
    const left = Math.min(Math.max(r.left, MARGIN), window.innerWidth - 180);
    setPos({ left, top, minWidth: r.width });
  }, [options.length]);

  // 浮层定位随滚动/缩放/拖拽跟随
  useEffect(() => {
    if (!open) return;
    place();
    const track = () => place();
    window.addEventListener('scroll', track, true);
    window.addEventListener('resize', track);
    return () => {
      window.removeEventListener('scroll', track, true);
      window.removeEventListener('resize', track);
    };
  }, [open, place]);

  // 外部点击 / Escape 关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (rootRef.current?.contains(n)) return;
      if (listRef.current?.contains(n)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="dsw-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dsw-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label ? <span className="dsw-menu-trigger-label">{label}</span> : null}
        <span className="dsw-menu-trigger-value">{selected?.label ?? ''}</span>
        <IconChevronDownOutlineRegular size={14} className="dsw-menu-caret" />
      </button>
      {open && pos && createPortal(
        <div
          ref={listRef}
          className="dsw-menu-list"
          role="menu"
          style={{ left: pos.left, top: pos.top, minWidth: pos.minWidth }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dsw-menu-viewport">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                className="dsw-menu-item"
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                {o.icon !== undefined && <span className="dsw-menu-item-icon">{o.icon}</span>}
                <span className="dsw-menu-item-label">{o.label}</span>
                {o.value === value && <IconCheckOutlineRegular className="dsw-menu-check" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ============ 开关 ============ */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className="dsw-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="dsw-switch-thumb" />
    </button>
  );
}

/* ============ 弹窗（Modal/Dialog） ============ */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, footer, width = 'min(440px, 100%)', children }: ModalProps) {
  const uid = useId();
  if (!open) return null;
  return (
    <div className="dsw-modal-root" onClick={onClose} role="presentation">
      <div className="dsw-modal-mask" />
      <div
        className="dsw-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={uid}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="dsw-modal-header">
            <span id={uid} className="dsw-modal-title">{title}</span>
            <IconButton label={t('common.close')} onClick={onClose}>
              <IconCloseOutlineRegular size={16} />
            </IconButton>
          </div>
        )}
        <div className="dsw-modal-content">{children}</div>
        {footer && <div className="dsw-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = t('common.confirm'),
  confirmVariant = 'primary',
  cancelLabel = t('common.cancel'),
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="dsw-modal-message">{message}</div>
    </Modal>
  );
}

/* ============ Tooltip（官方一致悬浮提示） ============ */
export type TooltipSide = 'right' | 'bottom' | 'top';

/**
 * 为单个锚点元素附加 hover/focus 提示气泡。气泡 portal 至 body，避免祖先裁剪/层叠上下文隐藏。
 * 竖向空间不足时自动翻转（bottom<->top）。
 */
export function Tooltip({
  label,
  side = 'right',
  delayMs = 0,
  children,
}: {
  label: string;
  side?: TooltipSide;
  delayMs?: number;
  children: ReactElement;
}) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [geom, setGeom] = useState<{ left: number; top: number; side: TooltipSide } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!el || !bubble) return;
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const MARGIN = 12;
    let left: number;
    let top: number;
    let placed: TooltipSide = side;
    if (side === 'right') {
      left = r.right + 10;
      top = r.top + r.height / 2;
    } else if (side === 'top') {
      left = r.left + r.width / 2 - b.width / 2;
      top = r.top - b.height - 8;
      if (top < MARGIN && r.bottom + b.height + 8 <= window.innerHeight - MARGIN) {
        top = r.bottom + 8;
        placed = 'bottom';
      }
    } else {
      left = r.left + r.width / 2 - b.width / 2;
      top = r.bottom + 8;
      if (top + b.height > window.innerHeight - MARGIN && r.top - b.height - 8 >= MARGIN) {
        top = r.top - b.height - 8;
        placed = 'top';
      }
    }
    left = Math.min(Math.max(left, MARGIN), window.innerWidth - b.width - MARGIN);
    top = Math.max(top, MARGIN);
    setGeom({ left, top, side: placed });
  }, [side]);

  useLayoutEffect(() => {
    if (visible) measure();
  }, [visible, measure]);

  const show = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (delayMs <= 0) setVisible(true);
    else timer.current = setTimeout(() => setVisible(true), delayMs);
  }, [delayMs]);

  const hide = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setVisible(false);
    setGeom(null);
  }, []);

  const child = children as ReactElement & {
    ref?: ((el: HTMLElement | null) => void) | React.RefObject<HTMLElement>;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  };
  const cloned = cloneElement(child, {
    ref: (el: HTMLElement | null) => {
      anchorRef.current = el;
      const cr = (child as { ref?: unknown }).ref;
      if (typeof cr === 'function') (cr as (el: HTMLElement | null) => void)(el);
      else if (cr && typeof cr === 'object' && 'current' in cr) {
        (cr as React.RefObject<HTMLElement | null>).current = el;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      child.props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      child.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      child.props.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      child.props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {cloned}
      {visible && createPortal(
        <span
          ref={bubbleRef}
          className="dsw-tooltip-bubble"
          data-side={geom?.side ?? side}
          role="tooltip"
          style={{ left: geom?.left ?? 0, top: geom?.top ?? 0, visibility: geom ? 'visible' : 'hidden' }}
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}

/* ============ Toast（官方一致顶部横幅） ============ */
export interface ToastOptions {
  text: string;
  tone?: 'success';
  icon?: ReactNode;
  holdMs?: number;
  actions?: readonly { label: string; prefix?: string; onClick: () => void }[];
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastCtx = createContext<(o: ToastOptions) => void>(() => {});

const TOAST_HOLD_MS = 3000;
const TOAST_FADE_MS = 1000;

function ToastBanner({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const latestOnDone = useRef(onDone);
  useLayoutEffect(() => {
    latestOnDone.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const hold = item.holdMs ?? TOAST_HOLD_MS;
    const timer = setTimeout(() => latestOnDone.current(), hold + TOAST_FADE_MS);
    return () => clearTimeout(timer);
  }, [item.holdMs]);

  return createPortal(
    <div
      className="dsw-toast"
      role="alert"
      style={{ '--dsh-toast-hold': `${item.holdMs ?? TOAST_HOLD_MS}ms` } as CSSProperties}
    >
      {item.tone === 'success' ? (
        <span className="dsw-toast-icon success" aria-hidden>
          <IconCheckCircleOutlineRegular />
        </span>
      ) : item.icon !== undefined ? (
        <span className="dsw-toast-icon" aria-hidden>
          {item.icon}
        </span>
      ) : null}
      <span className="dsw-toast-text">
        {item.text}
        {item.actions?.map((a) => (
          <React.Fragment key={a.label}>
            {a.prefix}
            <button type="button" className="dsw-toast-action" onClick={a.onClick}>
              {a.label}
            </button>
          </React.Fragment>
        ))}
      </span>
    </div>,
    document.body,
  );
}

/** 在应用根部挂载一次，向子树提供 useToast()。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((o: ToastOptions) => {
    setItems((prev) => [...prev, { ...o, id: Date.now() + Math.random() }]);
  }, []);
  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {items.map((t) => (
        <ToastBanner key={t.id} item={t} onDone={() => remove(t.id)} />
      ))}
    </ToastCtx.Provider>
  );
}

/** 调用方通过 const toast = useToast(); toast({ text, tone: 'success' }) 触发横幅。 */
export function useToast() {
  return useContext(ToastCtx);
}
