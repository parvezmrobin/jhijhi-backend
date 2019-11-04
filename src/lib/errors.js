/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 10, 2019
 */


module.exports.Error400 = function (error) {
  this.error = Array.isArray(error)? error: [error];
  this.code = 400;
};

module.exports.Error404 = function (error) {
  this.error = Array.isArray(error)? error: [error];
  this.code = 404;
};
