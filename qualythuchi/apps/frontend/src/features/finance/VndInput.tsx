import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { formatVndInput } from './finance-rules';

interface VndInputProps {
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
  placeholder?: string;
  describedBy?: string;
}

export function VndInput({ value, onChange, allowNegative = false, placeholder, describedBy }: VndInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<{ digits: number; hasNegative: boolean } | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const target = event.currentTarget;
    const beforeCaret = target.value.slice(0, target.selectionStart ?? target.value.length);
    const digits = beforeCaret.replace(/\D/g, '').length;
    const hasNegative = allowNegative && beforeCaret.trimStart().startsWith('-');
    const formatted = formatVndInput(target.value, allowNegative);
    caret.current = { digits, hasNegative };
    onChange(formatted);
    requestAnimationFrame(() => {
      const element = input.current;
      const position = caret.current;
      if (!element || !position) return;
      let seen = 0;
      let index = position.hasNegative ? 1 : 0;
      while (index < element.value.length && seen < position.digits) {
        if (/\d/.test(element.value[index]!)) seen++;
        index++;
      }
      element.setSelectionRange(index, index);
      caret.current = null;
    });
  }

  return <div className="finance-vnd-input">
    <input ref={input} type="text" inputMode={allowNegative ? 'text' : 'numeric'} value={value}
      onChange={handleChange} placeholder={placeholder} aria-describedby={describedBy} />
    <span aria-hidden="true">₫</span>
  </div>;
}
