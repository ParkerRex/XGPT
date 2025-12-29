import { select, input, confirm } from '@inquirer/prompts';
import type { SessionConfig } from '../types/session.js';

const SEARCH_SCOPE_OPTIONS = [
  {
    name: 'All posts',
    value: 'all' as const,
    description: 'Scrape all posts from this user (within time range)'
  },
  {
    name: 'Keyword filtered posts',
    value: 'keywords' as const,
    description: 'Only scrape posts containing specific keywords'
  }
];

export async function promptSearchScope(defaultKeywords: string[] = []): Promise<{
  searchScope: SessionConfig['searchScope'];
  keywords?: string[];
}> {
  console.log('\n[search] Step 2: Search Scope');
  console.log('Choose whether to scrape all posts or filter by keywords:\n');

  // Determine default scope based on whether default keywords exist
  const defaultScope = defaultKeywords.length > 0 ? 'keywords' : 'all';

  const searchScope = await select({
    message: 'What scope would you like to use?',
    choices: SEARCH_SCOPE_OPTIONS.map(option => ({
      name: option.name,
      value: option.value,
      description: option.description
    })),
    default: defaultScope
  });

  let keywords: string[] | undefined;

  if (searchScope === 'keywords') {
    console.log('\n📝 Keyword Configuration');
    console.log('Enter keywords to filter posts. Posts must contain at least one keyword.\n');

    // Show examples
    console.log('[tip] Examples:');
    console.log('   • AI, machine learning, chatgpt');
    console.log('   • typescript, javascript, react');
    console.log('   • startup, entrepreneurship, business\n');

    const keywordInput = await input({
      message: 'Enter keywords (comma-separated):',
      default: defaultKeywords.join(', '),
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Please enter at least one keyword';
        }
        const keywords = parseKeywords(input);
        if (keywords.length === 0) {
          return 'Please enter valid keywords separated by commas';
        }
        return true;
      }
    });

    keywords = parseKeywords(keywordInput);

    // Show parsed keywords for confirmation
    console.log('\n[list] Parsed keywords:');
    keywords.forEach((keyword, index) => {
      console.log(`   ${index + 1}. "${keyword}"`);
    });

    const confirmed = await confirm({
      message: 'Are these keywords correct?',
      default: true
    });

    if (!confirmed) {
      console.log('\n[sync] Let\'s try again...');
      return promptSearchScope(); // Recursive call to retry
    }
  }

  // Show selection confirmation
  const selectedOption = SEARCH_SCOPE_OPTIONS.find(opt => opt.value === searchScope);
  console.log(`\n[ok] Selected: ${selectedOption?.name}`);
  if (keywords) {
    console.log(`   Keywords: ${keywords.join(', ')}`);
  }
  console.log();

  return { searchScope, keywords };
}

export function parseKeywords(input: string): string[] {
  return input
    .split(',')
    .map(keyword => keyword.trim())
    .filter(keyword => keyword.length > 0)
    .map(keyword => keyword.toLowerCase()); // Normalize to lowercase for matching
}

export function matchesKeywords(text: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) {
    return true; // No keywords means match everything
  }

  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}
