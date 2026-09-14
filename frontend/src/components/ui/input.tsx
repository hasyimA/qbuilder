'use client';

import { forwardRef } from 'react';
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export const FORM_CONTROL =
  'w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const FORM_CONTROL_SM =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md bg-white text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

export function inputClassNames(size: 'sm' | 'md' = 'md', className?: string): string {
  return [size === 'sm' ? FORM_CONTROL_SM : FORM_CONTROL, className]
    .filter(Boolean)
    .join(' ');
}

function ControlLabel({
  label,
  htmlFor,
}: {
  label?: string | undefined;
  htmlFor?: string | undefined;
}) {
  if (!label) return null;
  return (
    <label
      {...(htmlFor ? { htmlFor } : {})}
      className="block text-sm font-medium text-gray-700 mb-1"
    >
      {label}
    </label>
  );
}

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  size?: 'sm' | 'md';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, size = 'md', className, id, ...props }, ref) => {
    const controlId = id ?? (label ? stringToId(label) : undefined);
    return (
      <div>
        <ControlLabel label={label} htmlFor={controlId} />
        <input
          ref={ref}
          {...(controlId ? { id: controlId } : {})}
          className={inputClassNames(size, className)}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className, id, ...props }, ref) => {
    const controlId = id ?? (label ? stringToId(label) : undefined);
    return (
      <div>
        <ControlLabel label={label} htmlFor={controlId} />
        <textarea
          ref={ref}
          {...(controlId ? { id: controlId } : {})}
          className={FORM_CONTROL + ` ${className ?? ''}`}
          {...props}
        />
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  size?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, size = 'md', className, id, ...props }, ref) => {
    const controlId = id ?? (label ? stringToId(label) : undefined);
    return (
      <div>
        <ControlLabel label={label} htmlFor={controlId} />
        <select
          ref={ref}
          {...(controlId ? { id: controlId } : {})}
          className={inputClassNames(size, className)}
          {...props}
        />
      </div>
    );
  }
);
Select.displayName = 'Select';

function stringToId(label: string): string {
  return `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}