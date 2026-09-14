'use client';

import { createContext, useContext } from 'react';

export interface UploadedImage {
  id: number;
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface EditorDeps {
  resolveMediaUrl: (mediaId: number) => Promise<string>;
  uploadImage: (file: File) => Promise<UploadedImage>;
}

export const EditorDepsContext = createContext<EditorDeps>({
  resolveMediaUrl: async () => '',
  uploadImage: async () => {
    throw new Error('Image upload is not configured.');
  },
});

export function useEditorDeps(): EditorDeps {
  return useContext(EditorDepsContext);
}