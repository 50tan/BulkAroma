import { FraterworksScraper } from './fraterworks.scraper';
const args = process.argv.slice(2);
const scraper = new FraterworksScraper();
scraper.run({ maxPages: args.includes('--test') ? 1 : undefined, testMode: args.includes('--test') })
  .catch(console.error);
