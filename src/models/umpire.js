/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */


const {model} = require('mongoose');

const umpireSchema = require('../schemas/umpire');

module.exports = model('Umpire', umpireSchema);
