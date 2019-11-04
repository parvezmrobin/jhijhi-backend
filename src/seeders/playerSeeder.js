/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 08, 2019
 */


const Player = require('../models/player');
const User = require('../models/user');

const players = [{
  name: 'robin',
  jerseyNo: 4,
}, {
  name: 'geshnu',
  jerseyNo: 5,
}, {
  name: 'pacada',
  jerseyNo: 6,
}, {
  name: 'akib',
  jerseyNo: 7,
}, {
  name: 'mati',
  jerseyNo: 8,
}, {
  name: 'shamma',
  jerseyNo: 80,
}, {
  name: 'disha',
  jerseyNo: 81,
}, {
  name: 'dibyo',
  jerseyNo: 9,
}, {
  name: 'tanin',
  jerseyNo: 1,
}, {
  name: 'purnam',
  jerseyNo: 420,
}, {
  name: 'sahad',
  jerseyNo: 12,
}, {
  name: 'buira',
  jerseyNo: 2,
}, {
  name: 'gomez',
  jerseyNo: 440,
}, {
  name: 'ashar',
  jerseyNo: 40,
}, {
  name: 'walindo',
  jerseyNo: 44,
}, {
  name: 'brinto',
  jerseyNo: 45,
}, {
  name: 'shan',
  jerseyNo: 46,
}, {
  name: 'abid',
  jerseyNo: 47,
}, {
  name: 'dulavai',
  jerseyNo: 48,
}, {
  name: 'tripto',
  jerseyNo: 49,
}];

module.exports = async function (userId) {
  const users = !userId ? await User.find({})
    : Array.isArray(userId) ? userId.map(id => ({ _id: id })) : [{ _id: userId }];
  const creatorWisePlayers = users.map(
    creator => players.map(player => ({
      ...player,
      creator: creator._id,
    })),
  );
  const playersWithCreators = [].concat(...creatorWisePlayers);
  return Player.insertMany(playersWithCreators);
};
