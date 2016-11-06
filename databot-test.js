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
  req().then((result) => {
    debug(result);
  })
}

function base64Encoder(imageStr){
  base64.encode(response.data[0].src,options,(err,imageStr) => {
      var bitmap = new Buffer(imageStr,'base64');
      fs.writeFile('save_image.jpg',bitmap);
    })
}
