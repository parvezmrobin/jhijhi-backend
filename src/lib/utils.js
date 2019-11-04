/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 10, 2019
 */

const logger = require('./logger');


/**
 * @param response
 * @param err
 * @param [err.statusCode]
 * @param [err.status]
 * @param [err.error]
 * @param [err.errors]
 * @param [err.jhijhi] if `err.jhijhi` is true, `err.message` is sent to user instead of `message`
 * @param [err.message]
 * @param message
 * @param [user=null]
 */
module.exports.sendErrorResponse = function (response, err, message, user = null) {
  const statusCode = err.statusCode || err.status || 500;

  response.status(statusCode);
  const errorDescription = {
    success: false,
    message: err.jhijhi ? err.message : message,
  };

  if (statusCode === 400) { // it is a validation error and should be sent with response payload
    logger.warn(`Error response ${statusCode}: ${message}`, {err, user});
    errorDescription.err = err.error || err.errors || err;
  } else {
    logger.error(`Error response ${statusCode}: ${message}`, {err, user});
  }

  response.json(errorDescription);
};

module.exports.send404Response = function (response, message) {
  logger.error('Error 404: ' + response.req.originalUrl);

  response.status(404)
    .json({
      success: false,
      message: message,
      err: [message],
    });
};

module.exports.nullEmptyValues = function (request, container = 'body') {
  const params = Object.assign({}, request[container]);
  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      if (params[key] === '' || params[key] === undefined) {
        params[key] = null;
      }
    }
  }
  return params;
};

/**
 * @param {String} str
 * @param {Boolean} smallCase
 * @return {String}
 */
module.exports.namify = function (str, smallCase = false) {
  return str.split(' ')
    .filter(s => s)
    .map(s => {
      const fistLetter = s[0].toUpperCase();
      let rest = s.substr(1);
      if (smallCase) {
        rest = rest.toLowerCase();
      }
      return fistLetter + rest;
    })
    .join(' ');
};

module.exports.isSameName = function (str1, str2) {
  const namify = module.exports.namify;
  return namify(str1, true) === module.exports.namify(str2, true);
};
