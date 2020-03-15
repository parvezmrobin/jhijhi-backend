/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 10, 2019
 */

const Logger = require('./logger');


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
function sendErrorResponse(response, err, message, user = null) {
  const statusCode = err.statusCode || err.status || 500;

  response.status(statusCode);
  const errorDescription = {
    success: false,
    message: err.jhijhi ? err.message : message,
  };

  if (statusCode === 400) { // it is a validation error and should be sent with response payload
    Logger.warn(`Error response ${statusCode}: ${message}`, {err, user});
    errorDescription.err = err.error || err.errors || err;
  } else {
    Logger.error(`Error response ${statusCode}: ${message}`, {err, user});
  }

  response.json(errorDescription);
}

function send404Response(response, message) {
  Logger.error(`Error 404: ${response.req.originalUrl}`);

  response.status(404)
    .json({
      success: false,
      message,
      err: [message],
    });
}

/**
 * Removes empty values from a request object
 * @param {Express.Request} request the request object to be manipulated
 * @param {String} [container] the value container to be operated on. can be body, params, cookies, etc.
 * default is 'body'.
 */
function nullEmptyValues(request, container = 'body') {
  const params = {...request[container]};
  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      if (params[key] === '' || params[key] === undefined) {
        params[key] = null;
      }
    }
  }
  return params;
}

/**
 * @param {String} str
 * @param {Boolean} smallCase
 * @return {String}
 */
function namify(str, smallCase = false) {
  return str.split(' ')
    .filter((s) => s)
    .map((s) => {
      const fistLetter = s[0].toUpperCase();
      let rest = s.substr(1);
      if (smallCase) {
        rest = rest.toLowerCase();
      }
      return fistLetter + rest;
    })
    .join(' ');
}

function isSameName(str1, str2) {
  return namify(str1, true) === module.exports.namify(str2, true);
}

module.exports.namify = namify;
module.exports.isSameName = isSameName;
module.exports.nullEmptyValues = nullEmptyValues;
module.exports.sendErrorResponse = sendErrorResponse;
module.exports.send404Response = send404Response;
