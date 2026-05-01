export function mergeDraftTagNames(existingTags: string[], rawValue: string): string[] {
  const value = rawValue.trim();
  if (!value) {
    return existingTags;
  }

  if (existingTags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
    return existingTags;
  }

  return [...existingTags, value];
}

export function normalizeDraftTagNames(tagNames: string[]): string[] {
  return tagNames.reduce<string[]>((items, tagName) => mergeDraftTagNames(items, tagName), []);
}
