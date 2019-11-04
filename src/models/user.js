/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */


const {model} = require('mongoose');

const userSchema = require('../schemas/user');

module.exports = model('User', userSchema);
