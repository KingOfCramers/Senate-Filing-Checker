const cheerio = require("cheerio");

const { mailer, asyncForEach } = require("../util");
const { updateDb, getUsers } = require("../mongodb");

const fetchFara = async (url, page) => { 
        await page.goto(url, { waitUntil: 'networkidle2' }); // Ensure no network requests are happening (in last 500ms).        
        const tableHandle = await page.$("div[id='apexir_DATA_PANEL'] tbody"); // page.$("div[id='apexir_DATA_PANEL'] tbody tr[class='even']");
        const html = await page.evaluate(body => body.innerHTML, tableHandle);
        await tableHandle.dispose();

        const $ = cheerio.load(html);
        const names = $("td[headers='NAME']").map((i,td) => $(td).text()).toArray();
        let links = $('td a:first-child').map((i, link) => $(link).attr("href")).toArray();
        links = links.map((link, i) => ({ url: `https://efile.fara.gov/pls/apex/${link}`, registrant: names[i] }));
        
        const getLinks = async ({ url, registrant }) => {
            
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 }); // Navigate to each page...

            const bodyHandle = await page.$("body div[id='apexir_DATA_PANEL'] tbody"); // page.$("div[id='apexir_DATA_PANEL'] tbody tr[class='even']");
            const html = await page.evaluate(body => body.innerHTML, bodyHandle);
            await bodyHandle.dispose();

            const $$ = cheerio.load(html);
            const allLinks = $$('a').map((i, link) => $(link).attr("href")).toArray();

            return { allLinks, registrant };
        };

        const results = await asyncForEach(links, getLinks);
        return results;
};

const bot = async (page, today) => {

    const todayUri = today.replace(/-/g,"\%2F"); // Create uri string...
    const link = `https://efile.fara.gov/pls/apex/f?p=181:6:0::NO:6:P6_FROMDATE,P6_TODATE:${todayUri},${todayUri}`; // Fetch today's data...

    return fetchFara(link, page)
        .then(async(results) => updateDb(results, "fara"))
        .then(async(res) => {
            let text = '–––New filings––– \n';
            if(res.length > 0){
                res.forEach(({ registrant, allLinks }) => {
                    text = text.concat(registrant).concat("\n");
                    allLinks.forEach(link => text = text.concat(link + "\n"));
                    text = text.concat("\n");
                });

                const emails = await getUsers({ fara: true });        
                return mailer(emails, text, 'Foreign Lobbyist(s)').then((res) => {
                    res = res.length > 0 ? res : 'fara - nobody to email!';
                    return res;
                });
            } else {
                return 'fara - no updates';
            }
        });
};

module.exports = bot;
