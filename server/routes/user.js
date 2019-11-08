var express = require("express");
var router = express.Router();
var axios = require("axios");
const URI = require("urijs");
const env = process.env.NODE_ENV || "development";
const config = require(__dirname + "/../config/config.json")[env];
const crypto = require("crypto");

/**
 * Add a new user
 */
router.post("/add", function (req, res, next) {
  let data = req.body;
  let now = new Date();

  data.salt = crypto.randomBytes(16).toString('hex');
  data.password = crypto.pbkdf2Sync(
    data.password,
    data.salt,
    1000,
    64,
    "sha512").toString("hex");
  data.created = now.toISOString();

  let bundle = {
    resourceType: "Person",
    id: "user",
    meta: {
      profile: config.fhir.server + "/fhir/StructureDefinition/iHRISUser",
    },
    extension: [
      {
        url: config.fhir.server + "/StructureDefinition/iHRISUserDetails",
        extension: [
          {
            url: "username",
            valueString: data.username
          },
          {
            url: "password",
            valueString: data.password
          },
          {
            url: "salt",
            valueString: data.salt
          },
          {
            url: "created",
            valueString: data.created
          }
        ]
      }
    ]
  };

  let url = URI(config.fhir.server).segment("fhir").segment("Person").toString();

  axios.post(url, bundle, {
    withCredentials: true,
    auth: {
      username: config.fhir.username,
      password: config.fhir.password
    }
  }).then(response => {
    res.status(201).json(response.data);
  }).catch(err => {
    res.status(400).json(err);
  });
});

/**
 * Get all users
 */
router.get("/list", function (req, res, next) {
  let url = URI(config.fhir.server).segment('fhir').segment('Person').toString();

  axios.get(url, {
    withCredentials: true,
    auth: {
      username: config.fhir.username,
      password: config.fhir.password
    }
  }).then(response => {
    res.status(201).json(response.data);
  }).catch(err => {
    res.status(400).json(err);
  });
});

/**
 * Check login credentials
 */
router.post("/login", function (req, res, next) {
  let url = URI(config.fhir.server).segment('fhir').segment('Person');
  url.addQuery('username:exact', req.body.username);
  url = url.toString();

  axios.get(url, {
    withCredentials: true,
    auth: {
      username: config.fhir.username,
      password: config.fhir.password
    }
  }).then(response => {

    let numMatches = response.data.total;

    if (numMatches == 0) {
      return res.status(400).json(response.data);
    } else {
      let user = response.data.entry[0].resource;
      let extensions = user.extension;

      for (var i in extensions) {
        if (extensions[i].url.includes("iHRISUserDetails")) {
          let userDetails = extensions[i].extension;
          let password = null;
          let salt = null;

          for (var j in userDetails) {
            if (userDetails[j].url == "password") {
              password = userDetails[j].valueString;
            }

            if (userDetails[j].url == "salt") {
              salt = userDetails[j].valueString;
            }
          }

          let hash = crypto.pbkdf2Sync(
            req.body.password,
            salt,
            1000,
            64,
            "sha512"
          ).toString("hex");

          let packet = {
            userId: user.id,
            username: req.body.username
          };

          // matching password
          if (hash === password) {
            return res.status(201).json(packet);
          } else {
            return res.status(400).json({});
          }
        }
      }

      res.status(400).json({});
    }
  }).catch(err => {
    res.status(400).json(err);
  });
});

module.exports = router;
