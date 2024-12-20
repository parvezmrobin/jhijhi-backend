/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 01, 2019
 */

const mongoose = require('mongoose');
const session = require('express-session');
const connectMongo = require('connect-mongo');
const passport = require('passport');
const logger = require('./lib/logger');

const MongoStore = connectMongo(session);

module.exports = function connect(app) {
  return mongoose
    .connect(
      process.env.IS_TEST ? process.env.TEST_DB_CONN : process.env.DB_CONN,
      {
        useNewUrlParser: true,
        useFindAndModify: false,
        useUnifiedTopology: true,
      }
    )
    .then((connection) => {
      logger.info(
        `Connected to database: '${mongoose.connection.db.databaseName}'`
      );

      app.use(
        session({
          secret: process.env.DB_CONN, // using db url as the secret key :P :P :P
          store: new MongoStore({ mongooseConnection: mongoose.connection }),
          resave: false,
          saveUninitialized: false,
        })
      );
      app.use(passport.session({}));

      return connection;
    })
    .catch((err) => logger.error('Error connecting to database', err));
};
