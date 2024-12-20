/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 08, 2019
 */

const { hashSync } = require('bcrypt');
const User = require('../models/user');

module.exports = async function userSeeder() {
  const usernames = ['robin', 'mim', 'oishie', 'geshnu', 'pacada'];
  await User.deleteMany({ username: { $in: usernames } });
  const users = usernames.map((username) => ({
    username,
    password: hashSync(username, 10),
  }));

  return User.insertMany(users);
};
