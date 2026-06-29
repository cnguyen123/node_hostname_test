var express = require('express');
var router = express.Router();
var os = require('os');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send({
    message: "Testing for rolling update node-hostname - Chanh Nguyen, 29 June 2026",
    hostname: os.hostname(),
    version: process.env.npm_package_version,
  });
});

module.exports = router;
