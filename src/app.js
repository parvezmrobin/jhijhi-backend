const express = require('express');
const cors = require('cors');
const onFinished = require('on-finished');
require('dotenv').config();

const logger = require('./lib/logger');
const authentication = require('./authentication');
const IndexRouter = require('./controllers/IndexController');
const AuthRouter = require('./controllers/AuthController');
const PlayerRouter = require('./controllers/PlayerController');
const TeamRouter = require('./controllers/TeamController');
const MatchRouter = require('./controllers/MatchController');
const UmpireRouter = require('./controllers/UmpireController');
const { send404Response } = require('./lib/utils');

const app = express();

require('./db')(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

app.use((request, response, next) => {
  const ping = Date.now();

  const backup = response.socket.write;
  let code;
  function newWriter(...args) {
    for (const arg of args) {
      if (typeof arg === 'string') {
        if (arg.startsWith('HTTP')) {
          const header = arg.substring(0, arg.indexOf('\n'));
          [, code] = header.split(' ');
          code = Number.parseInt(code, 10);
        }
      } else if (arg instanceof Buffer) {
        const message = `Responding ${code} | ${arg}`;
        if (code < 400) {
          logger.info(message);
        } else if (code < 500) {
          logger.warn(message);
        } else {
          logger.error(message);
        }
      }
    }

    return backup.apply(this, args);
  }
  response.socket.write = newWriter;

  onFinished(response, (err) => {
    const pong = Date.now();
    const elapsed = (pong - ping) / 1000;
    logger.info(
      `${new Date().toUTCString()} | ${request.method} ${request.originalUrl} ${
        response.statusCode
      } ${elapsed.toFixed(2)}s`,
      request.body,
      response.body
    );
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

app.use('/api', IndexRouter);
app.use('/api/auth', AuthRouter);
app.use('/api/players', PlayerRouter);
app.use('/api/teams', TeamRouter);
app.use('/api/matches', MatchRouter);
app.use('/api/umpires', UmpireRouter);

// catch 404 and forward to error handler
app.use((req, res) => {
  send404Response(res);
});

// error handler
// noinspection JSUnusedLocalSymbols
app.use((err, req, res) => {
  // eslint-disable-line no-unused-vars
  logger.error({ error: err, user: req.user });

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
