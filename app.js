const cron = require("node-cron");
const senatorBot = require("./senatorBot");
const senateCandidateBot = require("./senateCandidateBot");
const logger = require("./logger");

logger.info("App running...");

cron.schedule('*/15 * * * *', async () => {
    logger.info("Starting checks...");
    await senatorBot();
    await senateCandidateBot();
});