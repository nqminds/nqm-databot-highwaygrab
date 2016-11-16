module.exports = (function() {
  "use strict";

  const base64 = require("node-base64-image");
  const fs = require("fs");
  const path = require("path");
  const util = require("util");
  var cameraArray = [];
  var timestampArray = [];
  let tdxApi = null;
  let output = null;
  let packageParams = null;

  function saveAndUpdate(dataArray, index, timestampArray, timestamp, packageParams, cb) {
    let options = {
      string: true,
      local: false
    };

    let val = dataArray[index];
    const folderName = getFolderName(val.ID);
    const imagesFolder = output.getFileStorePath(folderName);
    try {
      fs.readdirSync(imagesFolder);
    } catch (e) {
      //console.log(e.errno);
      if (e.errno === -2) {
        fs.mkdirSync(imagesFolder);
      }
    }
    var fileName = getImageFileName(val.ID, timestamp);
    var pathName = path.join(folderName, fileName); 
    base64.encode(val.src, options, (error, result) => {
      if (error) {
        output.debug(error);
        cb(error, null, null);
      } else {
        var cameraObj = {
          ID: val.ID,
          DictIndex: timestampArray.length > (packageParams.imgLength - 1) ? (packageParams.imgLength - 1) : timestampArray.length,
          timestamp: timestamp
        };
        if (timestampArray.length >= packageParams.imgLength) {
          var unlinkIndex = timestampArray[0];
          timestampArray.shift();
          output.debug("timestampArray length is" + timestampArray.length);
          if (unlinkIndex) {
            const deleteFileName = getImageFileName(val.ID, unlinkIndex); 
            fs.unlinkSync(path.join(folderName, deleteFileName));
          }
        }
        fs.writeFileSync(pathName, result, { encoding: "base64" });
        cameraArray.push(cameraObj);

        // Why is this hard-coded? Shouldn't it be dataArray.length ?
        if (index >= 126) {
          cb(null, cameraObj, false);
          cameraArray = [];
        } else {
          saveAndUpdate(dataArray, index + 1, timestampArray, timestamp, packageParams, cb);
        }
      }
    });
  }

  /**
   * GPS grab and store:
   */
  function GrabHighway() {
    let complete = false;

    const req = function (cb) {
      /*
        array timestamp each time req() is called
      */
      let timestamp = Date.now();

      tdxApi.getDatasetData(packageParams.cameraTable, null, null, null, (err, response) => {
        if (err) {
          output.debug(err);
          cb(err);
        } else {
          output.debug("Retrived data length is " + response.data.length);
          saveAndUpdate(response.data, 0, timestampArray, timestamp, packageParams, function (err, cameraObj, next) {
            if (err) {
              output.debug(err);
            } else {
              if (next === false && next !== null && cameraObj !== null) {
                timestampArray.push(timestamp);
                output.debug("update dataset with data length is " + cameraArray.length);
                output.debug(tdxApi.updateDatasetDataAsync(packageParams.cameraLive, cameraArray, true));
                cb(null);
              }
            }
          });
        }
      });
    };

    setInterval(() => {
      if (!complete) {
        complete = true;
        req(function() {
          complete = false;
        });
      }
    }, packageParams.timerFrequency);
  }

  const getFolderName = function(id) {
    return util.format("%s-imgs", id);
  };

  const getImageFileName = function(id, timestamp) {
    return util.format("%s-%s-img.jpg", id, timestamp);
  };

  /**
   * Main databot entry function:
   * @param {Object} input schema.
   * @param {Object} output functions.
   * @param {Object} context of the databot.
   */
  function databot(input, output, context) {
    output = output;
    tdxApi = context.tdxApi;
    packageParams = context.packageParams;

    const restify = require("restify");
    const server = restify.createServer();

    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.queryParser());
    server.use(restify.bodyParser());

    server.get("/", function (req, res) {
      res.send("running");
    });

    server.get("/img/:folder/:timestampIndex", function (req, res) {
      var folderName = req.params.folder;
      var timestampValue = timestampArray[req.params.timestampIndex];
      
      output.debug("length of timestampArray is " + timestampArray.length);
      output.debug(timestampValue);
      
      if (timestampValue) {
        const fileName = getImageFileName(folderName, timestampValue);
        const filePath = output.getFileStorePath(fileName);
        output.debug("get file %s", filePath);

        /*
         * Shouldn't this decode the image and send it as content type image/jpeg?
         * Either way, it's much more efficient to use a stream here rather than
         * readFileSync.
         */
        var imgfile = new Buffer(fs.readFileSync(filePath), "base64");
        var sendObj = {
          ID: folderName,
          timestamp: timestampValue,
          base64String: imgfile
        };

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": JSON.stringify(sendObj).length
        });
        res.end(JSON.stringify(sendObj));
      } else {
        res.end("NO IMAGE");
      }
      //output.debug(readStream);
      //readStream.pipe(res);
    });

    server.listen(context.instancePort);

    GrabHighway();
  }

  let input;
  if (process.env.NODE_ENV === "test") {
    // Requires nqm-databot-trafficgrab.json file for testing
    input = require("./databot-test.js")(process.argv[2]);
  } else {
    // Load the nqm input module for receiving input from the process host.
    input = require("nqm-databot-utils").input;
  }

  // Read any data passed from the process host.
  input.pipe(databot);
}());