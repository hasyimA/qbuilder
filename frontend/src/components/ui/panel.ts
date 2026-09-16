export function surfaceClass(extra?: string): string {
  return ['bg-white rounded-lg border border-gray-200 shadow-sm', extra]
    .filter(Boolean)
    .join(' ');
}

export function interactiveCardClass(extra?: string): string {
  return [
    'bg-white rounded-lg border border-gray-200 shadow-xs',
    'transition-[border-color,box-shadow,transform] duration-200 ease-out',
    'hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}