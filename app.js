const cron = require("node-cron");
const senatorBot = require("./senatorBot");
const senateCandidateBot = require("./senateCandidateBot");
const faraBot = require("./faraBot");
const logger = require("./logger");
const users = require("./keys/users");

logger.info("App running...");

cron.schedule('*/15 * * * *', async () => {    
    const browser = await pupeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage(); // Create new instance of puppet

    await page.setRequestInterception(true) // Optimize (no stylesheets, images)...
    page.on('request', (request) => {
        if(['image', 'stylesheet'].includes(request.resourceType())){
            request.abort();
        } else {
            request.continue();
        }
    });
    logger.info(`Chrome Launched...`);
    
    await senatorBot(users, page);
    await senateCandidateBot(users, page); // This sequence matters, because agree statement will not be present...
    await faraBot(users, page);

    await page.close();
    await browser.close();
    logger.info(`Chrome Closed.`);


});