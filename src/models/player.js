/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */


const {model} = require('mongoose');

const playerSchema = require('../schemas/player');

module.exports = model('Player', playerSchema);
