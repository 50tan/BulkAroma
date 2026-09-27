import { PerfumerSupplyHouseScraper } from './perfumer-supply-house.scraper';
const args = process.argv.slice(2);
const scraper = new PerfumerSupplyHouseScraper();
scraper.run({ maxPages: args.includes('--test') ? 1 : undefined, testMode: args.includes('--test') })
  .catch(console.error);
