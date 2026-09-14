'use client';

import { useEffect } from 'react';

/** Sets document.title for a client-rendered page. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}