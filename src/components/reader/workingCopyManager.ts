import type { BlockPatch, DocumentAnnotation, WorkingCopy } from '../../ai/readers/readerTypes';

/**
 * Creates an initial WorkingCopy state for a document.
 * Ensures the original document file remains untouched and read-only.
 */
export function createWorkingCopy(documentId: string, originalUri: string): WorkingCopy {
  const now = new Date().toISOString();
  return {
    documentId,
    originalUri,
    workingUri: originalUri,
    isDirty: false,
    patches: [],
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Adds or updates an annotation on a specific block.
 * Anchored to blockId so it survives document view switching.
 */
export function addAnnotationToWorkingCopy(
  copy: WorkingCopy,
  annotation: Omit<DocumentAnnotation, 'createdAt' | 'updatedAt'>
): WorkingCopy {
  const now = new Date().toISOString();
  const existingIndex = copy.annotations.findIndex((item) => item.id === annotation.id);
  const nextAnnotations = [...copy.annotations];

  if (existingIndex >= 0) {
    nextAnnotations[existingIndex] = {
      ...nextAnnotations[existingIndex],
      ...annotation,
      updatedAt: now,
    };
  } else {
    nextAnnotations.push({
      ...annotation,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    ...copy,
    annotations: nextAnnotations,
    isDirty: true,
    updatedAt: now,
  };
}

/**
 * Removes an annotation by its ID.
 */
export function removeAnnotationFromWorkingCopy(copy: WorkingCopy, annotationId: string): WorkingCopy {
  const now = new Date().toISOString();
  const nextAnnotations = copy.annotations.filter((item) => item.id !== annotationId);
  return {
    ...copy,
    annotations: nextAnnotations,
    isDirty: nextAnnotations.length !== copy.annotations.length,
    updatedAt: now,
  };
}

/**
 * Records a block-level surgical patch.
 * This hook is pre-wired for V1.5 block replacement.
 */
export function recordBlockPatch(copy: WorkingCopy, patch: BlockPatch): WorkingCopy {
  const now = new Date().toISOString();
  return {
    ...copy,
    patches: [...copy.patches, patch],
    isDirty: true,
    updatedAt: now,
  };
}
