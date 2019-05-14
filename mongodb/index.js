const loadDB = require('./db');
const logger = require("../logger");
const { Senator, SenateCandidate, Fara } = require("./schemas/data");
const { Aclu } = require("./schemas/aclu");
const { User } = require("./schemas/user");

const getUsers = async (search) => {
    
    const db = await loadDB();
    const fullUsers = await User.find(search);
    const users = fullUsers.map((user) => user.email);
    await db.disconnect();
    return users;
};

const updateDb = async (data, Model) => {

    if(data.length === 0){
        return [];
    };

    const db = await loadDB();
    const results = await Model.find({});

    /// Determining any of the scraped data is new....
    let newData;
    switch(Model){
        case Senator :
        case SenateCandidate:
            newData = data.filter(resObj => !results.some(jsonObj => jsonObj.link === resObj.link));
            break;
        case Fara:
            newData = data.filter(resObj => !results.some(jsonObj => (jsonObj.registrant === resObj.registrant && (jsonObj.allLinks.some(link => resObj.allLinks.includes(link)) | ((jsonObj.allLinks.length == 0) && (resObj.allLinks.length == 0 ))))));
            break;
        default:
            newData = [];            
    };

    if(newData.length > 0){ // If new, create new time stamp, and add to database...
        newData = newData.map(item => ({ ...item, createdAt: new Date() }))
        await Model.insertMany(newData).then(() => logger.info(`${Model.modelName} - ${newData.length} documents inserted!`));
    }
    
    await db.disconnect();
    return newData;
};

const checkBorderCase = async (number) => {
    
    const db = await loadDB();
    let dbNumber = await Aclu.find();
    dbNumber = dbNumber[0].borderCase;

    // await logger.info(`DB Border Case Docs ${dbNumber}, ACLU Webpage Docs: ${number}`);
    if(dbNumber < number){
        await Aclu.updateOne({ "borderCase" : dbNumber }, { $set: { "borderCase": number }});
    };

    await db.disconnect();
    return dbNumber < number; // Return either true or false, depending on what database says...

};

module.exports = {
    getUsers,
    updateDb,
    checkBorderCase
}