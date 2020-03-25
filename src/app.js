const express = require('express');
const createError = require('http-errors');
const cors = require('cors');
const onFinished = require('on-finished');

require('dotenv').config();
const logger = require('./lib/logger');
const indexRouter = require('./controllers/index');
const authRouter = require('./controllers/auth');
const playersRouter = require('./controllers/players');
const teamsRouter = require('./controllers/teams');
const matchesRouter = require('./controllers/matches');
const umpiresRouter = require('./controllers/umpires');
const authentication = require('./authentication');

const app = express();

require('./db')(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

app.use((request, response, next) => {
  const ping = Date.now();
  onFinished(response, (err) => {
    const pong = Date.now();
    const elapsed = (pong - ping) / 1000;
    logger.info(`${(new Date()).toUTCString()} | ${request.method} ${request.originalUrl} ${
      response.statusCode
    } ${elapsed.toFixed(2)}s`, request.body, response.body);
    if (err) {
      logger.error(err);
    }
  });
  next();
});

app.use(authentication());

/**
 * @namespace Request
 * @property {User} user
 */

/**
 * @namespace express.Request
 * @property {User} user
 */

app.all('/ping', (req, res) => {
  res.send({
    message: 'pong',
  });
});

app.use('/api', indexRouter);
app.use('/api/auth', authRouter);
app.use('/api/players', playersRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/umpires', umpiresRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// error handler
// noinspection JSUnusedLocalSymbols
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error({error: err, user: req.user});

  // generate the error
  res.status(err.status || 500);
  const error = {};

  Object.getOwnPropertyNames(err).forEach((key) => {
    error[key] = err[key];
  });

  error.stack = error.stack.split('\n').map((str) => str.trim());

  // only providing error in development
  res.json({
    message: error.message,
    error: req.app.get('env') === 'development' ? error : {},
  });
});

module.exports = app;
