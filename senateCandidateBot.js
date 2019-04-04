const pupeteer = require("puppeteer");
const cheerio = require("cheerio");
const moment = require("moment");
const nodemailer = require("nodemailer");
const config = require("./keys/config");
const logger = require("./logger");
const fs = require("fs");
const util = require("util");

let readFile = util.promisify(fs.readFile);

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  auth: {
    type: "OAuth2",
    user: config.auth.user,
    clientId: config.auth.clientId,
    clientSecret: config.auth.clientSecret,
    refreshToken: config.auth.refreshToken
  }
});

const fetchContracts = async (url) => {

    try {
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
        
        await page.goto(url, { waitUntil: 'networkidle2' }); // Ensure no network requests are happening (in last 500ms).
        await Promise.all([
            page.click("#agree_statement"),
            page.waitForNavigation()
        ]);

        await page.click('.form-check-input.candidate_filer');

        await Promise.all([
            page.click(".btn-primary"),
            page.waitForNavigation()
        ]);    
        
        await Promise.all([
            page.click('#filedReports th:nth-child(5)'),
            page.waitForResponse('https://efdsearch.senate.gov/search/report/data/')
        ]);

        await Promise.all([
            page.click('#filedReports th:nth-child(5)'),
            page.waitForResponse('https://efdsearch.senate.gov/search/report/data/')
        ]);
        
        let html = await page.content();
        await page.close();
        await browser.close();
        return html;
    } catch(err){
        throw { message: err.message };
    }
}

const mailer = (emails, text) => {
    const promises = emails.map(email => {
        let HelperOptions = {
            from: 'FiDi Bot <hcramer@nationaljournal.com>',
            to: email,
            subject: `Financial Disclosure (Senate Candidate)`,
            text
        };

        return transporter.sendMail(HelperOptions);
    });

    return Promise.all(promises)
};

const bot = (users) => {

    fetchContracts("https://efdsearch.senate.gov/search/")
    .then(async(html) => {
        let $ = cheerio.load(html);

        let tds = $(".table-striped tr[role='row'] td").map((i, item) => $(item).text()).toArray()
        let links = $('tbody tr a').map((i, link) => $(link).attr("href")).toArray()

        let data = links.map((link, x) => {
            let result = { link, tds: [] };
            for(let i = 0; i < 5; i++){
               result.tds.push(tds[i + (x * 5)]);
            }
            return result;
        });

        return data;
    })
    .then(async(data) => {

        let results = [];
        data.forEach(datum => {
            let today = moment().format("YYYY-DD-MM");
                today = "2019-01-03";
            let no_format_date = new Date(datum.tds[4]).toUTCString();
            let date = moment(no_format_date).format("YYYY-DD-MM");
            if(today === date){
                let link = `https://efdsearch.senate.gov${datum.link}`;
                results.push({
                    first: datum.tds[0],
                    last: datum.tds[1],
                    link
                })
            };
        });

        return results;
    })
    .then(async(results) => {
        try {
            let file = await readFile("./captured/results.json", { encoding: 'utf8' });
            let JSONfile = JSON.parse(file); // Old data...
            let newData = results.filter(resObj => !JSONfile.some(jsonObj => jsonObj.link === resObj.link)); // All new objects that aren't in the old array...
            let allData = JSON.stringify(JSONfile.concat(newData)); // Combine the two to rewrite to file...
            if(newData.length > 0){
                fs.writeFileSync("./captured/results.json", allData, 'utf8'); // Write file...
            }
            return newData; // Return new data only...
        } catch(err){
            throw { message: err.message };
        };
    })
    .then((results) => {
        let text = '–––New filings––– \n';
        if(results.length > 0){
          results.forEach(({ first, last, link}) => {
              let textPlus = `${first} ${last}: ${link}\n`;
              text = text.concat(textPlus);
          });
    
        let emails = users.map(({ email }) => email);
        return mailer(emails, text);

        } else {
            return Promise.resolve("No updates");
        }
    })
    .then((res) => {
        let today = moment().format("YYYY-DD-MM");
        logger.info(`Senate Candidate Check –– ${JSON.stringify(res)}`);
    })
    .catch(err => {
        logger.debug(JSON.stringify(err))
    });
}

module.exports = bot;
