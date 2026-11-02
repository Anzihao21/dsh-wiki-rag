/**
 * dsh-wiki-rag 官方一致 UI 组件库。
 * 复刻自 DeepSeek Harness 官方 `@deepseek-ai/dsh-client-ui-primitives`：
 * 全部样式只消费官方设计令牌 var(--dsw-alias-*) / var(--dsw-specific-*) / var(--dsw-static-*)，
 * 明暗主题由宿主 body[data-ds-dark-theme] 级联自动切换，禁止任何 JS 主题切换或 hex 字面量。
 */
import React, { useId, type ReactNode } from 'react';
import {
  IconCloseOutlineRegular,
  IconLoadingOutlineMedium,
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular
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

export function IconButton({ variant = 'ghost', size = 'default', label, children, className = '', ...rest }: IconButtonProps) {
  return (
    <button className={`dsw-btn dsw-btn-${variant} dsw-btn-${size} dsw-btn-icon-only ${className}`} aria-label={label} title={rest.title ?? label} {...rest}>
      {children}
    </button>
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
  placeholder = '搜索',
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

/* 下拉：官方以 Menu 实现，这里复刻为消费官方令牌的 select 外壳（宿主可换官方 Menu） */
export interface DropdownOption {
  value: string;
  label: string;
}

export function DropdownSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
}) {
  return (
    <span className="dsw-input dsw-select">
      {label && <span className="dsw-select-label">{label}</span>}
      <select className="dsw-select-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <IconChevronDownOutlineRegular size={14} className="dsw-select-caret" />
    </span>
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
            <IconButton label="关闭" onClick={onClose}>
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
  confirmLabel = '确定',
  confirmVariant = 'primary',
  cancelLabel = '取消',
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
