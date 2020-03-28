/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 29, 2020
 */

const express = require('express');

const router = express.Router();

/* GET home page. */
router.get('/', (req, res) => {
  res.json({ title: 'Jhijhi' });
});

module.exports = router;
