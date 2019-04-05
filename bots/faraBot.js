const logger = require("../logger");
const fs = require("fs");
const util = require("util");
let readFile = util.promisify(fs.readFile);
const cheerio = require("cheerio");

const { mailer, asyncForEach } = require("../util");

const fetchFara = async (url, page) => { 
    try { // Connect to page, get all links...        
        await page.goto(url, { waitUntil: 'networkidle2' }); // Ensure no network requests are happening (in last 500ms).        
        const tableHandle = await page.$("div[id='apexir_DATA_PANEL'] tbody"); // page.$("div[id='apexir_DATA_PANEL'] tbody tr[class='even']");
        const html = await page.evaluate(body => body.innerHTML, tableHandle);
        await tableHandle.dispose();

        let $ = cheerio.load(html);
        let links = $('td a:first-child').map((i, link) => $(link).attr("href")).toArray();
        let names = $("td[headers='NAME']").map((i,td) => $(td).text()).toArray();

        links = links.map((link, i) => ({ url: `https://efile.fara.gov/pls/apex/${link}`, registrant: names[i] }));
        const getLinks = async ({ url, registrant }) => {
            
            await page.goto(url, { waitUntil: 'networkidle2' }); // Navigate to each page...

            const bodyHandle = await page.$("body div[id='apexir_DATA_PANEL'] tbody"); // page.$("div[id='apexir_DATA_PANEL'] tbody tr[class='even']");
            const html = await page.evaluate(body => body.innerHTML, bodyHandle);
            await bodyHandle.dispose();

            let $ = cheerio.load(html);
            let allLinks = $('a').map((i, link) => $(link).attr("href")).toArray();

            return { allLinks, registrant };
        };

        const promises = await asyncForEach(links, ({ url, registrant }) => getLinks({ url, registrant }));
        return promises;

    }
    catch(err){
        throw { message: err.message };
    }
};

const bot = (users, page, today) => new Promise((resolve, reject) => {

    const todayUri = today.replace(/-/g,"\%2F"); // Create uri string...
    const link = `https://efile.fara.gov/pls/apex/f?p=181:6:0::NO:6:P6_FROMDATE,P6_TODATE:${todayUri},${todayUri}`; // Fetch today's data...

    fetchFara(link, page)
        .then(async(links) => {
            try {
                let file = await readFile("./captured/fara.json", { encoding: 'utf8' });
                let JSONfile = JSON.parse(file); // Old data...
                let newData = links.filter(resObj => !JSONfile.some(jsonObj => (jsonObj.registrant === resObj.registrant && (jsonObj.allLinks.some(link => resObj.allLinks.includes(link)) | ((jsonObj.allLinks.length == 0) && (resObj.allLinks.length == 0 )))))); // All new objects that aren't in the old array...
                let allData = JSON.stringify(JSONfile.concat(newData)); // Combine the two to rewrite to file...
                if(newData.length > 0){
                    fs.writeFileSync("./captured/fara.json", allData, 'utf8'); // Write file...
                }
                return newData; // Return new data only...
            } catch(err){
                throw { message: err.message };
            };
        })
        .then(async(res) => {

            let text = '–––New filings––– \n';
            if(res.length > 0){
                res.forEach(({ registrant, allLinks }) => {
                    text = text.concat(registrant).concat("\n");
                    allLinks.forEach(link => text = text.concat(link + "\n"));
                    text = text.concat("\n");
                });

                let emails = users.filter(user => user.fara).map(({ email }) => email);
                return mailer(emails, text, 'Foreign Lobbyist(s)');
            } else {
                return Promise.resolve("No updates");
            }
        })
        .then((res) => {
            logger.info(`FARA Check –– ${JSON.stringify(res)}`);
            resolve();
        })
        .catch(err => {
            reject(err);
        });
});

module.exports = bot;
