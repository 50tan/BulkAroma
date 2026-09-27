import { PerfumerSupplyHouseScraper } from './perfumer-supply-house.scraper';
import { FraterworksScraper } from './fraterworks.scraper';
import { PerfumersApprenticeScraper } from './perfumers-apprentice.scraper';

async function main() {
  const args = process.argv.slice(2);
  const maxPages = args.includes('--test') ? 1 : undefined;
  const testMode = args.includes('--test');

  console.log('\n========================================');
  console.log('Bulkaroma Price Intelligence — Full Scrape');
  console.log('========================================\n');

  const scrapers = [
    { name: 'Perfumer Supply House', scraper: new PerfumerSupplyHouseScraper() },
    { name: 'Fraterworks', scraper: new FraterworksScraper() },
    { name: "The Perfumer's Apprentice", scraper: new PerfumersApprenticeScraper() },
  ];

  const results: Record<string, unknown> = {};

  for (const { name, scraper } of scrapers) {
    try {
      console.log(`\nStarting ${name}...`);
      const summary = await scraper.run({ maxPages, testMode });
      results[name] = { status: 'completed', summary };
    } catch (err) {
      console.error(`Error running ${name}:`, (err as Error).message);
      results[name] = { status: 'error', error: (err as Error).message };
      // Continue with other scrapers! A failure in one supplier must never break the others.
    }
  }

  console.log('\n========================================');
  console.log('Full Scrape Complete');
  console.log('========================================');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
