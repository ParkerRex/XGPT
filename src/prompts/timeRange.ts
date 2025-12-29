import { select, input, confirm } from '@inquirer/prompts';
import { TIME_RANGE_OPTIONS, type SessionConfig } from '../types/session.js';
import { calculateDateRange, formatDateRange, isValidDateString } from '../utils/dateUtils.js';

export async function promptTimeRange(defaultValue: SessionConfig['timeRange'] = 'lifetime'): Promise<{
  timeRange: SessionConfig['timeRange'];
  customDateRange?: { start: Date; end: Date };
}> {
  console.log('\n[date] Step 3: Time Range');
  console.log('Choose the time range for scraping tweets:\n');

  const timeRange = await select({
    message: 'What time range would you like to scrape?',
    choices: TIME_RANGE_OPTIONS.map(option => ({
      name: option.name,
      value: option.value,
      description: option.description
    })),
    default: defaultValue
  });

  let customDateRange: { start: Date; end: Date } | undefined;

  if (timeRange === 'custom') {
    console.log('\n📝 Custom Date Range');
    console.log('Enter your custom date range (YYYY-MM-DD format):\n');

    const startDateInput = await input({
      message: 'Start date (YYYY-MM-DD):',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Please enter a start date';
        }
        if (!isValidDateString(input)) {
          return 'Please enter a valid date in YYYY-MM-DD format';
        }
        return true;
      }
    });

    const endDateInput = await input({
      message: 'End date (YYYY-MM-DD):',
      default: new Date().toISOString().split('T')[0], // Today's date
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Please enter an end date';
        }
        if (!isValidDateString(input)) {
          return 'Please enter a valid date in YYYY-MM-DD format';
        }

        const startDate = new Date(startDateInput);
        const endDate = new Date(input);

        if (endDate <= startDate) {
          return 'End date must be after start date';
        }

        if (endDate > new Date()) {
          return 'End date cannot be in the future';
        }

        return true;
      }
    });

    const startDate = new Date(startDateInput);
    const endDate = new Date(endDateInput);

    customDateRange = { start: startDate, end: endDate };

    // Show confirmation
    console.log(`\n[stats] Custom range: ${formatDateRange(startDate, endDate)}`);

    const confirmed = await confirm({
      message: 'Is this date range correct?',
      default: true
    });

    if (!confirmed) {
      console.log('\n[sync] Let\'s try again...');
      return promptTimeRange(); // Recursive call to retry
    }
  }

  // Calculate and show the actual date range
  const dateRange = timeRange === 'custom' ? customDateRange! : calculateDateRange(timeRange);

  // Show selection confirmation
  const selectedOption = TIME_RANGE_OPTIONS.find(opt => opt.value === timeRange);
  console.log(`\n[ok] Selected: ${selectedOption?.name}`);

  if (timeRange !== 'lifetime') {
    console.log(`   Date range: ${formatDateRange(dateRange.start, dateRange.end)}`);

    const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`   Duration: ${daysDiff} days`);
  } else {
    console.log('   Duration: All available tweets');
  }
  console.log();

  return { timeRange, customDateRange };
}
