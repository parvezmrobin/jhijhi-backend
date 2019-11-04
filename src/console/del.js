/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: May 23, 2019
 */


const mongoose = require('mongoose');
const User = require('../models/user');
const Player = require('../models/player');
const Match = require('../models/match');
const Team = require('../models/team');
require('dotenv').config();

(async () => {
  try {
    const username = process.argv[2];
    if (!username) {
      throw new Error('No username provided');
    }

    await mongoose.connect(process.env.DB_CONN, {
      useNewUrlParser: true,
      useFindAndModify: false,
    });
    console.log('Connected to database: \'jhijhi\'');
    const user = await User.findOneAndDelete({ username });
    if (!user) {
      throw new Error('Invalid username provided');
    }
    console.log(`Delete user ${username}`);

    let deleteResponse;
    deleteResponse = await Player.deleteMany({ creator: user._id });
    console.log(`Deleted ${deleteResponse.deletedCount} player(s)`);

    deleteResponse = await Team.deleteMany({ creator: user._id });
    console.log(`Deleted ${deleteResponse.deletedCount} teams(s)`);

    deleteResponse = await Match.deleteMany({ creator: user._id });
    console.log(`Deleted ${deleteResponse.deletedCount} match(es)`);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
