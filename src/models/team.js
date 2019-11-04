/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */


const {model} = require('mongoose');

const teamSchema = require('../schemas/team');

module.exports = model('Team', teamSchema);
