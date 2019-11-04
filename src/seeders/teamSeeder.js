/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 08, 2019
 */


const Team = require('../models/team');
const User = require('../models/user');

const teams = [{
  name: 'Dhaka Gladiators',
  shortName: 'DG',
}, {
  name: 'Khulna Titans',
  shortName: 'KT',
}, {
  name: 'CricPlatoon CC',
  shortName: 'CCC',
}];

module.exports = async function (userId) {
  const users = !userId ? await User.find({})
    : Array.isArray(userId) ? userId.map(id => ({ _id: id })) : [{ _id: userId }];
  const creatorWiseTeamPromises = users.map(async creator =>
    teams.map(team => ({
      ...team,
      creator: creator._id,
    })));
  const teamsWithCreatorPromises = [].concat(...creatorWiseTeamPromises);
  const teamsWithCreators = await Promise.all(teamsWithCreatorPromises);
  const flattenedTeams = [].concat(...teamsWithCreators);
  return Team.insertMany(flattenedTeams);
};
