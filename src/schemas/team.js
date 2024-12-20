/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */

const { Schema } = require('mongoose');
const schemaOptions = require('./schemaOptions');

module.exports = new Schema(
  {
    name: String,
    shortName: String,
    presets: [
      {
        name: {
          type: String,
          required: true,
        },
        players: [
          {
            type: Schema.Types.ObjectId,
            ref: 'Player',
          },
        ],
      },
    ],
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  schemaOptions
);
