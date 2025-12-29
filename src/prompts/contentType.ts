import { select } from '@inquirer/prompts';
import { CONTENT_TYPE_OPTIONS, type SessionConfig } from '../types/session.js';

export async function promptContentType(defaultValue: SessionConfig['contentType'] = 'tweets'): Promise<SessionConfig['contentType']> {
  console.log('\n[done] Step 1: Content Type Selection');
  console.log('Choose what type of content you want to scrape:\n');

  const contentType = await select({
    message: 'What content would you like to scrape?',
    choices: CONTENT_TYPE_OPTIONS.map(option => ({
      name: option.name,
      value: option.value,
      description: option.description
    })),
    default: defaultValue
  });

  // Show selection confirmation
  const selectedOption = CONTENT_TYPE_OPTIONS.find(opt => opt.value === contentType);
  console.log(`\n[ok] Selected: ${selectedOption?.name}`);
  console.log(`   ${selectedOption?.description}\n`);

  return contentType;
}

export function getContentTypeFilters(contentType: SessionConfig['contentType']) {
  switch (contentType) {
    case 'tweets':
      return {
        includeReplies: false,
        includeRetweets: false
      };
    case 'replies':
      return {
        includeReplies: true,
        includeRetweets: false
      };
    case 'both':
      return {
        includeReplies: true,
        includeRetweets: false
      };
    default:
      return {
        includeReplies: false,
        includeRetweets: false
      };
  }
}
