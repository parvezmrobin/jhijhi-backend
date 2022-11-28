/**
 * Parvez M Robin
 * me@parvezmrobin.com
 * Date: Oct 22, 2019
 */

const winston = require('winston');
require('winston-daily-rotate-file');

const { simple, colorize } = winston.format;
const axios = require('axios');
const fs = require('fs');

let writable = false;
try {
  fs.accessSync('text.txt', fs.constants.W_OK);
  writable = true;
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err);
}

const logger = winston.createLogger({
  level: 'info',
  format: simple(),
});

if (writable) {
  const fileTransports = [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write to all logs with level `warn` and below to `validation.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.DailyRotateFile({
      filename: 'logs/%DATE%/error.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/%DATE%/validation.log',
      datePattern: 'YYYY-MM-DD',
      level: 'warn',
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/%DATE%/combined.log',
      datePattern: 'YYYY-MM-DD',
    }),
  ];

  for (const fileTransport of fileTransports) {
    logger.add(fileTransport);
  }
}

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (!writable || process.env.NODE_ENV !== 'production') {
  const consoleTransport = new winston.transports.Console({
    format: colorize({ all: true }),
  });
  logger.add(consoleTransport);
}

async function amplitude(eventName, userId, data, time) {
  // eslint-disable-next-line no-param-reassign
  time = Number(time || new Date());
  try {
    await axios.post('https://api.amplitude.com/2/httpapi', {
      api_key: process.env.AMPLITUDE_KEY,
      events: [
        {
          event_type: eventName,
          user_id: userId,
          event_properties: data,
          time,
        },
      ],
    });
  } catch (err) {
    logger.error('Error Amplitude:', {
      err: err.response && err.response.data,
    });
  }
}

module.exports = logger;
module.exports.amplitude = amplitude;
