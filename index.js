/**
 * GPS grab and store:
 * @param {Object} tdx Api object.
 * @param {Object} output functions.
 * @param {Object} packageParams of the databot.
 */

function GrabHighway(tdxApi,output,packageParams){
  "use strict"
  let options = {
    string:true,
    local: false
  }
  let cameraArray = [];
  var req = function(){
    return tdxApi.getDatasetDataAsync(packageParams.cameraTable, null, null, null)
      .then((response) => {
        output.debug("Retrived data length is "+response.data.length);
        return Promise.all(_.map(response.data,(val,i) => {
          return base64.encodeAsync(val.src,options)
          .then((result) => {
            var cameraObj = {
              ID:i,
              latitude:val.latitude,
              longitude:val.longitude,
              base64String:result
            }
            return (cameraObj);
          })
          .catch((err) => {
            output.debug("catch err with base64 %s",err);
          })
        }))
      })
      .then((result) => {
        _.forEach(result,(val) => {
          cameraArray.push(val);
        });
        output.debug("get cameraArray length is "+ cameraArray.length);
        return tdxApi.updateDatasetDataAsync(packageParams.cameraLatest,cameraArray,true);
      })
      .catch((err) => {
        output.debug("get dataset data err "+err);
      })
  }
  var computing = false;
  //var timer = setInterval(() => {
    //if(!computing){
      req().then((result) => {
        output.debug(result);
        computing = false;
      });
    //}
  //},packageParams.timerFrequency);
}

/**
 * Main databot entry function:
 * @param {Object} input schema.
 * @param {Object} output functions.
 * @param {Object} context of the databot.
 */
function databot(input, output, context) {
    "use strict"
    output.progress(0);

    var tdxApi = new TDXAPI({
        commandHost: context.commandHost,
        queryHost: context.queryHost,
        accessTokenTTL: context.packageParams.accessTokenTTL
    });

    Promise.promisifyAll(tdxApi);

    tdxApi.authenticate(context.shareKeyId, context.shareKeySecret, function (err, accessToken) {
        if (err) {
            output.error("%s", JSON.stringify(err));
            process.exit(1);
        } else {
            GrabHighway(tdxApi, output, context.packageParams);
        }
    });
}


var request = require("request-promise");
var TDXAPI = require("nqm-api-tdx");
var _ = require("lodash");
var base64 = require("node-base64-image");
var fs = require("fs");
var Promise = require("bluebird");

// var tdxAPI = new TdxApi(TDXconfig);
// Promise.promisifyAll(tdxAPI);
Promise.promisifyAll(base64);

if (process.env.NODE_ENV == 'test') {
    // Requires nqm-databot-trafficgrab.json file for testing
    input = require('./databot-test.js')(process.argv[2]);
} else {
    // Load the nqm input module for receiving input from the process host.
    input = require("nqm-databot-utils").input;
}

// Read any data passed from the process host. Specify we're expecting JSON data.
input.pipe(databot);
