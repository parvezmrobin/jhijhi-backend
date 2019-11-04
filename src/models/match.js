/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */


const {model} = require('mongoose');

const matchSchema = require('../schemas/match');

module.exports = model('Match', matchSchema);
