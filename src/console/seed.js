/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 08, 2019
 */


const mongoose = require('mongoose');
require('dotenv').config();

const seed = function (fileName, userId) {
  const seeder = require(`../seeders/${fileName}Seeder`);
  const Model = require(`../models/${fileName}`);

  let promise;
  if (!userId) {
    promise = Promise.resolve();
  } else {
    const cursor = Array.isArray(userId)
      ? Model.find({creator: {$in: userId}})
      : Model.find({creator: userId});
    promise = cursor.exec()
      .then(docs => {
        return Promise.all(docs.map(doc => doc.remove()));
      });
  }

  return promise
    .then(() => seeder(userId))
    .then((res) => {
      console.log(`seeded ${!res ? res : res.length} items of ${fileName}Seeder.`);
      return res;
    })
    .catch(console.error);
};

mongoose
  .connect(process.env.DB_CONN, {
    useNewUrlParser: true,
    useFindAndModify: false,
  })
  .then(async () => {
    console.log(`Connected to database: 'jhijhi'`);
    const seeders = ['player', 'team', 'match'];

    let userId;
    const username = process.argv[2];
    if (username) {
      const {hashSync} = require('bcrypt');
      const User = require('../models/user');
      const user = await User.findOneAndUpdate({username: username}, {password: hashSync(username, 10)}, {
        upsert: true,
        new: true,
      });
      userId = user._id;
    } else {
      const users = await seed('user');
      userId = users.map(user => user._id);
    }

    for (const seeder of seeders) {
      await seed(seeder, userId);
    }

    return process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });


