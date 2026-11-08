import type { ContextBudget, PromptCitation, PromptContextResult, RagSnippet } from '../../types';

export class PromptContextBuilder {
  public static buildContext(snippets: RagSnippet[], budget?: ContextBudget): PromptContextResult {
    const maxChars = budget?.maxChars ?? 2500;
    const maxSnippets = budget?.maxSnippets ?? snippets.length;
    const headerPrefix = budget?.headerPrefix ?? '【参考资料切片】';

    if (snippets.length === 0) {
      return {
        formattedContext: '',
        citations: [],
        totalChars: 0,
        snippetCount: 0,
      };
    }

    const citations: PromptCitation[] = [];
    const formattedBlocks: string[] = [];
    let currentLength = headerPrefix.length + 2;

    const candidateSnippets = snippets.slice(0, maxSnippets);

    for (let index = 0; index < candidateSnippets.length; index++) {
      const snippet = candidateSnippets[index]!;
      const refNumber = index + 1;
      const refId = `[${refNumber}]`;

      const blockHeader = `${refId} 《${snippet.documentTitle}》`;
      const blockBody = snippet.text.trim();
      const blockFull = `${blockHeader}\n${blockBody}`;

      if (currentLength + blockFull.length > maxChars && formattedBlocks.length > 0) {
        // 预算已满，截断
        break;
      }

      formattedBlocks.push(blockFull);
      currentLength += blockFull.length + 2;

      citations.push({
        refId,
        chunkId: snippet.chunkId,
        documentId: snippet.documentId,
        title: snippet.documentTitle,
      });
    }

    const formattedContext = formattedBlocks.length > 0
      ? `${headerPrefix}\n\n${formattedBlocks.join('\n\n')}`
      : '';

    return {
      formattedContext,
      citations,
      totalChars: formattedContext.length,
      snippetCount: formattedBlocks.length,
    };
  }
}
