/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 10, 2019
 */

class JhijhiError extends Error {
  constructor(code, name, message) {
    super();
    this.jhijhi = true;
    this.code = code;
    this.status = code;
    this.name = name;
    this.message = message;
  }
}

class Error400 extends JhijhiError {
  constructor(error, message) {
    super(400, 'Bad Request', message);
    this.error = Array.isArray(error) ? error : [error];
  }
}

class Error404 extends JhijhiError {
  constructor(message) {
    super(404, 'Not Found Request', message);
  }
}

module.exports.Error400 = Error400;
module.exports.Error404 = Error404;
