/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */


const {Schema} = require('mongoose');
const schemaOptions = require('./schemaOptions');

module.exports = new Schema({
  name: String,
  shortName: String,
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, schemaOptions);
