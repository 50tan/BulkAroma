import { PerfumersApprenticeScraper } from './perfumers-apprentice.scraper';
const args = process.argv.slice(2);
const scraper = new PerfumersApprenticeScraper();
scraper.run({ maxPages: args.includes('--test') ? 1 : undefined, testMode: args.includes('--test') })
  .catch(console.error);
