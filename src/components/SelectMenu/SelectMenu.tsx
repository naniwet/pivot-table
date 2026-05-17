import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SelectMenuOption {
  value: string;
  label: string;
}

export interface SelectMenuProps {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  testId?: string;
  className?: string;
}

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
  className,
}: SelectMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={className ? `select-menu ${className}` : 'select-menu'}
      data-open={open ? 'true' : 'false'}
    >
      <button
        type="button"
        className="select-menu__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={testId ? `${testId}-trigger` : undefined}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="select-menu__value">{selected?.label ?? ''}</span>
        <span className="select-menu__chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="select-menu__list" role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className="select-menu__option"
                data-selected={isSelected ? 'true' : 'false'}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="select-menu__check" aria-hidden>
                  {isSelected ? '✓' : ''}
                </span>
                <span className="select-menu__option-label">{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
