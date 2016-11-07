"use strict"
var request = require("request-promise");
var TdxApi = require("nqm-api-tdx");
var debug = require("debug")("highGrab");
var config = require("./config");
var _ = require("lodash");
var base64 = require("node-base64-image");
var fs = require("fs");
var Promise = require("bluebird");

var TDXconfig = {
  "commandHost": "https://cmd.nq-m.com",
  "queryHost": "https://q.nq-m.com"
};

var tdxAPI = new TdxApi(TDXconfig);
Promise.promisifyAll(tdxAPI);
Promise.promisifyAll(base64);


tdxAPI.authenticate(config.shareId,config.shareKey,function(err,accessToken){
  if(err)
    throw err;
  else{
    insertData(tdxAPI,config);
  }
});

function insertData(tdxApi,config){
  let options = {
    string:true,
    local: false
  }
  let cameraArray = [];
  var req = function(){
    return tdxApi.getDatasetDataAsync(config.packageParams.cameraTable, null, null, null)
      .then((response) => {
        debug("Retrived data length is "+response.data.length);
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
            debug("catch err with base64 %s",err);
          })
        }))
      })
      .then((result) => {
        _.forEach(result,(val) => {
          cameraArray.push(val);
        });
        debug("get cameraArray length is "+ cameraArray.length);
        return tdxApi.updateDatasetDataAsync(config.packageParams.cameraLatest,cameraArray,true);
      })
      .catch((err) => {
        debug("get dataset data err "+err);
      })
  }
  var timer = setInterval(() => {
    req().then((result) => {
      debug(result);
    })
  },config,packageParams,timerFrequency);
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
            GrabTraffic(tdxApi, output, context.packageParams);
        }
    });
}
