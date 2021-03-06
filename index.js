
module.exports = (function () {
  "use strict";

  const base64 = require("node-base64-image");
  const fs = require("fs");
  const path = require("path");
  const util = require("util");
  const _ = require("lodash");
  const Promise = require("bluebird");
  const fse = require("fs-extra");
  var cameraArray = [];
  var timestampArray = [];
  let tdxApi = null;
  let output = null;
  let packageParams = null;

  //Promise.promisifyAll(fs);

  var fsoptions = {
    flags: 'w',
    defaultEncoding: 'base64',
    fd: null,
    mode: 0o666,
    autoClose: true
  };

  function saveAndUpdate(dataArray, index, timestampArray, timestamp, packageParams, output, cb) {
    let options = {
      string: true,
      local: false
    };

    let val = dataArray[index];
    const folderName = getFolderName(val.ID);
    const imagesFolder = output.getFileStorePath(folderName);
    fs.readdir(imagesFolder, (err, files) => {
      if (err) {
        fs.mkdirSync(imagesFolder);
      }
      var fileName = getImageFileName(val.ID, timestamp);
      var pathName = path.join(imagesFolder, fileName);

      base64.encode(val.src, options, (error, result) => {
        if (error) {
          output.debug(error);
          cb(error, null, null);
        } else {
          var DictIndex = timestampArray.length;
          if (timestampArray.length >= packageParams.imgLength) {
            var unlinkIndex = timestampArray[0];
            if (unlinkIndex) {
              DictIndex -= 1;
            }
          }
          var cameraObj = {
            ID: val.ID,
            DictIndex: DictIndex,
            timestamp: timestamp
          };
          //output.debug("save path is "+pathName);
          fs.writeFileSync(pathName, result, { encoding: "base64" });
          cameraArray.push(cameraObj);

          // Why is this hard-coded? Shouldn't it be dataArray.length ?
          if (index >= dataArray.length - 1) {
            cb(null, cameraObj, false);
            cameraArray = [];
          } else {
            saveAndUpdate(dataArray, index + 1, timestampArray, timestamp, packageParams, output, cb);
          }
        }
      });
    })
  }

  /**
   * GPS grab and store:
   */
  function GrabHighway(tdxApi, output, packageParams) {
    let complete = false;
    const storeFolder = output.getFileStorePath("./");
    //output.debug("storeFolder is "+storeFolder);
    fse.emptyDir(storeFolder, function (err) {
      if (err) {
        output.debug(err);
      } else {
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
              saveAndUpdate(response.data, 0, timestampArray, timestamp, packageParams, output, function (err, cameraObj, next) {
                if (err) {
                  output.debug(err);
                } else {
                  if (next === false && next !== null && cameraObj !== null) {
                    if (timestampArray.length >= packageParams.imgLength) {
                      var unlinkIndex = timestampArray[0];
                      timestampArray.shift();
                      _.forEach(response.data, (val) => {
                        const folderName = getFolderName(val.ID);
                        const imagesFolder = output.getFileStorePath(folderName);
                        const deleteFileName = getImageFileName(val.ID, unlinkIndex);
                        fs.unlinkSync(path.join(imagesFolder, deleteFileName));
                      })
                      //output.debug("timestampArray length is" + timestampArray.length);
                    }
                    timestampArray.push(timestamp);
                    //output.debug("timestampArray length is now" + timestampArray.length);
                    //output.debug("update dataset with data length is " + cameraArray.length);
                    tdxApi.updateDatasetDataAsync(packageParams.cameraLive, cameraArray, true)
                    //output.debug(tdxApi.updateDatasetDataAsync(packageParams.cameraLive, cameraArray, true));
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
            req(function () {
              complete = false;
            });
          }
        }, packageParams.timerFrequency);
      }
    })

    // var targetRemoveFolderss = fs.readdirSync(storeFolder);
    // for (var folder in targetRemoveFiles) {
    //   var targetFiles = fs.readdirSync(storeFolder+"/"+targetRemoveFolders[folder]);
    //   for(var files in targetFiles){
    //     fs.unlinkSync(storeFolder+"/"+targetRemoveFolders[folder]+"/"+targetFiles[files]);
    //   }
    //   fs.rmdirSync(storeFolder+"/"+targetRemoveFolders[folder]);
    // }

  }

  const getFolderName = function (id) {
    return util.format("%s-imgs", id);
  };

  const getImageFileName = function (id, timestamp) {
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
    var fsoptions = {
      flags: 'r',
      defaultEncoding: 'base64',
      fd: null,
      mode: 0o666,
      autoClose: true
    };

    server.get("/", function (req, res) {
      res.send("running");
    });

    server.get('/img/:folder/:timestampIndex', function (req, res, next) {
      var folderName = getFolderName(req.params.folder);
      var timestampValue = timestampArray[req.params.timestampIndex];
      const imagesFolder = output.getFileStorePath(folderName);
      //output.debug("imagesFolder is "+imagesFolder);
      //output.debug("length of timestampArray is "+timestampArray.length);
      //output.debug(timestampValue);
      if (timestampValue) {
        const fileName = getImageFileName(req.params.folder, timestampValue);
        //output.debug("get fileName %s", fileName);
        var filePath = path.join(imagesFolder, fileName);
        //output.debug("get file %s", filePath);

        var readStream = fs.createReadStream(filePath, fsoptions);
        var stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': 'image/gif',
          'Content-Length': stat.size
        });
        readStream.pipe(res);
      } else {
        res.end("NO IMAGE");
      }
      //output.debug(readStream);

    });
    server.get('/id/:folder/:timestampIndex', function (req, res, next) {
      var timestampValue = timestampArray[req.params.timestampIndex];
      //output.debug("length of timestampArray is "+timestampArray.length);
      //output.debug(timestampValue);
      if (timestampValue) {
        var sendObj = {
          timestamp: timestampValue
        };

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": JSON.stringify(sendObj).length
        });
        res.end(JSON.stringify(sendObj));
      } else {
        res.send("NO IMAGE");
      }
    })

    server.listen(context.instancePort);

    GrabHighway(tdxApi, output, context.packageParams);
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
} ());